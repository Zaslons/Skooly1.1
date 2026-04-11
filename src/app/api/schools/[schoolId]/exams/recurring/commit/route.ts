import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { recurringExamsPayloadSchema } from "@/lib/formValidationSchemas";
import { assertSetupStepReadyOrThrow, TemporalRuleError } from "@/lib/domain/temporalRules";
import { expandRecurringExamLoops } from "@/lib/domain/recurringExamRules";
import prisma from "@/lib/prisma";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import type { Day } from "@prisma/client";
import { isSchedulingPipelineCommitEnabled } from "@/lib/schedulingFeatureFlags";
import { logSchedulingEvent } from "@/lib/schedulingLogger";

type OccurrencePreview = Awaited<ReturnType<typeof expandRecurringExamLoops>>["groupedByWeekIndex"][number];

function computeRequestId(params: {
  schoolId: string;
  termId: string;
  loops: unknown;
  strictMode: boolean;
  maxScore: number;
  weight: number;
  titlePrefix: string | null | undefined;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        schoolId: params.schoolId,
        termId: params.termId,
        loops: params.loops,
        strictMode: params.strictMode,
        maxScore: params.maxScore,
        weight: params.weight,
        titlePrefix: params.titlePrefix ?? null,
      })
    )
    .digest("hex")
    .slice(0, 16);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ code: "SCHOOL_ID_REQUIRED", error: "School ID is required." }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  let termIdForAudit: string | undefined;

  try {
    const body = await request.json();
    const validated = recurringExamsPayloadSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { code: "INVALID_INPUT", error: "Invalid input", fieldErrors: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    termIdForAudit = validated.data.termId;

    // E2 lock: only allow when prerequisites are complete.
    await assertSetupStepReadyOrThrow(schoolId, "dsRecurringExams");

    if (!(await isSchedulingPipelineCommitEnabled(schoolId))) {
      return NextResponse.json(
        {
          code: "SCHEDULING_PIPELINE_DISABLED",
          error: "Scheduling pipeline commits are disabled for this school.",
        },
        { status: 403 }
      );
    }

    const startedAt = performance.now();

    const requestId = computeRequestId({
      schoolId,
      termId: validated.data.termId,
      loops: validated.data.loops,
      strictMode: validated.data.strictMode ?? true,
      maxScore: validated.data.maxScore ?? 100,
      weight: validated.data.weight ?? 1.0,
      titlePrefix: validated.data.titlePrefix ?? null,
    });

    const preview = await expandRecurringExamLoops({
      schoolId,
      payload: validated.data,
      requestId,
    });

    const occurrences = Object.values(preview.groupedByWeekIndex).flat();
    const conflictOccurrences = occurrences.filter((o) => o.status === "conflict");
    if (validated.data.strictMode ?? true) {
      if (conflictOccurrences.length > 0) {
        const durationMs = Math.round(performance.now() - startedAt);
        const conflictPayload = {
          code: "RECURRING_EXAMS_CONFLICT",
          error: "Strict mode aborted: conflicts detected.",
          requestId,
          summary: preview.summary,
          groupedConflictReasons: preview.summary.conflictReasons,
          conflicts: conflictOccurrences.map((c) => ({
            weekIndex: c.weekIndex,
            occurrenceIndex: c.occurrenceIndex,
            startTime: c.startTime,
            endTime: c.endTime,
            reason: c.reason,
          })),
          durationMs,
        };

        await prisma.recurringExamCommitLog
          .create({
            data: {
              schoolId,
              termId: validated.data.termId,
              requestId,
              durationMs,
              success: false,
              examsCreated: 0,
              errorCode: "RECURRING_EXAMS_CONFLICT",
              summaryJson: JSON.stringify({
                summary: preview.summary,
                conflictCount: conflictOccurrences.length,
              }),
            },
          })
          .catch(() => {
            /* best-effort audit */
          });

        logSchedulingEvent({
          op: "RECURRING_EXAMS_COMMIT",
          schoolId,
          termId: validated.data.termId,
          requestId,
          durationMs,
          success: false,
          errorCode: "RECURRING_EXAMS_CONFLICT",
          conflictCount: conflictOccurrences.length,
        });

        return NextResponse.json(conflictPayload, { status: 409 });
      }
    }

    const toCreate = occurrences.filter((o) => o.status === "create" && o.resolvedLesson && o.templateKey);

    const createdExamIds: number[] = [];
    let examRowsInserted = 0;

    await prisma.$transaction(async (tx) => {
      // 1) Create/reuse ExamTemplates deterministically (dedupe by templateKey).
      const templateKeyToId = new Map<string, string>();

      const makeTemplateKeyId = (tk: NonNullable<(typeof toCreate)[number]["templateKey"]>) => {
        return JSON.stringify({
          termId: preview.termId,
          day: tk.day,
          startMs: tk.startTime.getTime(),
          endMs: tk.endTime.getTime(),
          classId: tk.classId,
          subjectId: tk.subjectId,
          teacherId: tk.teacherId,
          roomId: tk.roomId,
        });
      };

      for (const occ of toCreate) {
        const tk = occ.templateKey!;
        const mapKey = makeTemplateKeyId(tk);
        if (templateKeyToId.has(mapKey)) continue;

        const existing = await tx.examTemplate.findFirst({
          where: {
            schoolId,
            termId: preview.termId,
            day: tk.day,
            startTime: tk.startTime,
            endTime: tk.endTime,
            classId: tk.classId,
            subjectId: tk.subjectId,
            teacherId: tk.teacherId,
            roomId: tk.roomId,
          } as any,
          select: { id: true },
        });

        const templateId = existing?.id ?? undefined;
        if (templateId) {
          templateKeyToId.set(mapKey, templateId);
          continue;
        }

        const titlePrefix = validated.data.titlePrefix ?? null;
        const template = await tx.examTemplate.create({
          data: {
            schoolId,
            termId: preview.termId,
            title: titlePrefix ? `${titlePrefix} Template` : null,
            day: tk.day,
            startTime: tk.startTime,
            endTime: tk.endTime,
            classId: tk.classId,
            subjectId: tk.subjectId,
            teacherId: tk.teacherId,
            roomId: tk.roomId,
          },
          select: { id: true },
        });

        templateKeyToId.set(mapKey, template.id);
      }

      // 2) Bulk-create Exams from occurrences.
      const examsToCreate = toCreate.map((occ) => {
        const templateId = templateKeyToId.get(
          JSON.stringify({
            termId: preview.termId,
            day: occ.templateKey!.day,
            startMs: occ.templateKey!.startTime.getTime(),
            endMs: occ.templateKey!.endTime.getTime(),
            classId: occ.templateKey!.classId,
            subjectId: occ.templateKey!.subjectId,
            teacherId: occ.templateKey!.teacherId,
            roomId: occ.templateKey!.roomId,
          })
        );

        if (!templateId) {
          // Should not happen; skip safely.
          return null;
        }

        const durationMinutes = Math.max(
          1,
          Math.round((occ.endTime.getTime() - occ.startTime.getTime()) / 60000)
        );

        const titlePrefix = validated.data.titlePrefix ?? null;
        const title = titlePrefix ? `${titlePrefix}` : "DS Recurring Exam";

        return {
          title,
          startTime: occ.startTime,
          endTime: occ.endTime,
          durationMinutes,
          maxScore: validated.data.maxScore ?? 100,
          weight: validated.data.weight ?? 1.0,

          isRecurring: true,
          lessonId: occ.resolvedLesson!.lessonId,
          termId: preview.termId,
          examTemplateId: templateId,
        };
      }).filter(Boolean) as any[];

      if (examsToCreate.length === 0) {
        return;
      }

      const created = await tx.exam.createMany({
        data: examsToCreate,
        skipDuplicates: true,
      });

      // createMany doesn't return ids; we return counts only.
      createdExamIds.push(...[]);
      examRowsInserted = created.count;
    });

    const durationMs = Math.round(performance.now() - startedAt);

    await prisma.recurringExamCommitLog
      .create({
        data: {
          schoolId,
          termId: validated.data.termId,
          requestId,
          durationMs,
          success: true,
          examsCreated: examRowsInserted,
          errorCode: null,
          summaryJson: JSON.stringify({
            summary: preview.summary,
            toCreateCount: toCreate.length,
          }),
        },
      })
      .catch(() => {
        /* best-effort audit */
      });

    logSchedulingEvent({
      op: "RECURRING_EXAMS_COMMIT",
      schoolId,
      termId: validated.data.termId,
      requestId,
      durationMs,
      success: true,
      examsCreated: examRowsInserted,
    });

    return NextResponse.json(
      {
        code: "RECURRING_EXAMS_COMMITTED",
        error: null,
        requestId,
        summary: preview.summary,
        durationMs,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof TemporalRuleError) {
      return NextResponse.json(
        { code: err.code, error: err.message, fieldErrors: err.fieldErrors },
        { status: 400 }
      );
    }

    console.error("[E3_RECURRING_EXAMS_COMMIT]", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    logSchedulingEvent({
      op: "RECURRING_EXAMS_COMMIT",
      schoolId,
      termId: termIdForAudit,
      success: false,
      error: errMsg,
    });

    if (termIdForAudit) {
      await prisma.recurringExamCommitLog
        .create({
          data: {
            schoolId,
            termId: termIdForAudit,
            requestId: crypto.randomBytes(8).toString("hex"),
            durationMs: 0,
            success: false,
            examsCreated: 0,
            errorCode: errMsg.slice(0, 120),
            summaryJson: JSON.stringify({ error: errMsg }),
          },
        })
        .catch(() => {
          /* best-effort audit */
        });
    }

    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}


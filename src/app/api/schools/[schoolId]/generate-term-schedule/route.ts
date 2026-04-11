import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { assertSetupStepReadyOrThrow, TemporalRuleError } from "@/lib/domain/temporalRules";
import {
  generateTermScheduleRequestSchema,
  type GenerateTermScheduleResponse,
  type GenerateTermScheduleScope,
} from "@/lib/formValidationSchemas";
import { generateTermLessons } from "@/lib/domain/termLessonGenerationRules";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import { isSchedulingPipelineCommitEnabled } from "@/lib/schedulingFeatureFlags";
import { logSchedulingEvent } from "@/lib/schedulingLogger";

function scopeLogFields(scope: GenerateTermScheduleScope) {
  if (scope.type === "school") {
    return { scopeType: "school" as const, scopeGradeId: null as number | null, scopeClassId: null as number | null };
  }
  if (scope.type === "grade") {
    return { scopeType: "grade" as const, scopeGradeId: scope.gradeId, scopeClassId: null as number | null };
  }
  return { scopeType: "class" as const, scopeGradeId: null as number | null, scopeClassId: scope.classId };
}

function scopesMatchDbRow(
  row: { scopeType: string; scopeGradeId: number | null; scopeClassId: number | null },
  scopeFields: ReturnType<typeof scopeLogFields>
) {
  return (
    row.scopeType === scopeFields.scopeType &&
    (row.scopeGradeId ?? null) === (scopeFields.scopeGradeId ?? null) &&
    (row.scopeClassId ?? null) === (scopeFields.scopeClassId ?? null)
  );
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

  try {
    const body = await request.json();
    const validated = generateTermScheduleRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          code: "INVALID_INPUT",
          error: "Invalid input",
          fieldErrors: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    await assertSetupStepReadyOrThrow(schoolId, "generateTerm");

    const { termId, mode, idempotencyKey, simulateFailureAtOccurrenceIndex, scope } = validated.data;

    if (mode === "commit" && !(await isSchedulingPipelineCommitEnabled(schoolId))) {
      return NextResponse.json(
        {
          code: "SCHEDULING_PIPELINE_DISABLED",
          error: "Scheduling pipeline commits are disabled for this school.",
        },
        { status: 403 }
      );
    }

    const requestId = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          schoolId,
          termId,
          mode,
          idempotencyKey,
          scope,
        })
      )
      .digest("hex")
      .slice(0, 16);

    const scopeFields = scopeLogFields(scope);
    const started = performance.now();

    if (mode === "commit") {
      const prior = await prisma.termScheduleGenerationLog.findFirst({
        where: {
          schoolId,
          termId,
          idempotencyKey,
          mode: "commit",
          success: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (prior && scopesMatchDbRow(prior, scopeFields)) {
        let parsed: {
          summary?: GenerateTermScheduleResponse["summary"];
          conflicts?: GenerateTermScheduleResponse["conflicts"];
        };
        try {
          parsed = JSON.parse(prior.summaryJson) as typeof parsed;
        } catch {
          parsed = {};
        }

        const durationMs = Math.round(performance.now() - started);
        const result: GenerateTermScheduleResponse = {
          requestId: prior.requestId,
          termId,
          scope,
          summary:
            parsed.summary ??
            ({
              totalCandidates: 0,
              createdCount: 0,
              conflictedCount: 0,
              skippedByReason: {
                HOLIDAY: 0,
                BREAK: 0,
                EXAM_PERIOD: 0,
                ALREADY_EXISTS: 0,
                EXAM_CONFLICT: 0,
                EXAM_CONFLICT_UNKNOWN: 0,
              },
            } as GenerateTermScheduleResponse["summary"]),
          conflicts: parsed.conflicts ?? [],
          durationMs,
          idempotentReplay: true,
        };

        logSchedulingEvent({
          op: "GENERATE_TERM_SCHEDULE",
          schoolId,
          termId,
          mode,
          requestId: prior.requestId,
          durationMs,
          success: true,
          idempotentReplay: true,
        });

        return NextResponse.json(result, { status: 200 });
      }
    }

    try {
      const core = await generateTermLessons({
        schoolId,
        termId,
        mode,
        idempotencyKey,
        requestId,
        scope,
        simulateFailureAtOccurrenceIndex,
      });

      const durationMs = Math.round(performance.now() - started);

      const summaryForLog = {
        summary: core.summary,
        conflicts: core.conflicts.slice(0, 500),
        conflictsStoredTruncated: core.conflicts.length > 500,
        conflictTotal: core.conflicts.length,
        conflictsSample: core.conflicts.slice(0, 200),
        conflictsTruncated: core.conflicts.length > 200,
      };

      await prisma.termScheduleGenerationLog.create({
        data: {
          schoolId,
          termId,
          requestId: core.requestId,
          idempotencyKey,
          mode,
          ...scopeFields,
          durationMs,
          success: true,
          errorCode: null,
          summaryJson: JSON.stringify(summaryForLog),
        },
      });

      logSchedulingEvent({
        op: "GENERATE_TERM_SCHEDULE",
        schoolId,
        termId,
        mode,
        requestId: core.requestId,
        durationMs,
        success: true,
        summary: core.summary,
        conflictCount: core.conflicts.length,
      });

      const result: GenerateTermScheduleResponse = {
        ...core,
        durationMs,
      };

      return NextResponse.json(result, { status: 200 });
    } catch (genErr) {
      const durationMs = Math.round(performance.now() - started);
      const errMessage = genErr instanceof Error ? genErr.message : String(genErr);

      await prisma.termScheduleGenerationLog.create({
        data: {
          schoolId,
          termId,
          requestId,
          idempotencyKey,
          mode,
          ...scopeFields,
          durationMs,
          success: false,
          errorCode: errMessage.slice(0, 200),
          summaryJson: JSON.stringify({ error: errMessage }),
        },
      }).catch(() => {
        /* best-effort audit */
      });

      logSchedulingEvent({
        op: "GENERATE_TERM_SCHEDULE",
        schoolId,
        termId,
        mode,
        requestId,
        durationMs,
        success: false,
        error: errMessage.slice(0, 500),
      });

      if (errMessage === "SIMULATED_FAILURE_IN_TERM_GENERATION") {
        return NextResponse.json(
          {
            code: "SIMULATED_FAILURE",
            error: "Simulated failure: transaction rolled back; no LessonSession rows should persist.",
            durationMs,
          },
          { status: 422 }
        );
      }

      throw genErr;
    }
  } catch (err) {
    if (err instanceof TemporalRuleError) {
      return NextResponse.json(
        { code: err.code, error: err.message, fieldErrors: err.fieldErrors },
        { status: 400 }
      );
    }

    if (err instanceof Error && err.message === "TERM_NOT_FOUND") {
      return NextResponse.json({ code: "TERM_NOT_FOUND", error: "Term not found." }, { status: 404 });
    }

    if (err instanceof Error && err.message === "SCOPE_CLASS_NOT_FOUND") {
      return NextResponse.json(
        { code: "SCOPE_CLASS_NOT_FOUND", error: "classId does not exist for this school." },
        { status: 400 }
      );
    }

    if (err instanceof Error && err.message === "SCOPE_GRADE_NOT_FOUND") {
      return NextResponse.json(
        {
          code: "SCOPE_GRADE_NOT_FOUND",
          error: "gradeId is invalid or has no classes in this school.",
        },
        { status: 400 }
      );
    }

    console.error("[E4_GENERATE_TERM_SCHEDULE]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireRole, type AuthUser, requireSchoolAccess } from "@/lib/auth";
import { recurringExamsPayloadSchema } from "@/lib/formValidationSchemas";
import { assertSetupStepReadyOrThrow, TemporalRuleError } from "@/lib/domain/temporalRules";
import { expandRecurringExamLoops } from "@/lib/domain/recurringExamRules";

export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ code: "SCHOOL_ID_REQUIRED", error: "School ID is required." }, { status: 400 });
  }

  // Ensure user is allowed for this school + has admin role.
  // requireSchoolAccess supports system_admin bypass, while requireRole enforces role.
  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const user = accessOrResponse as AuthUser;
  if (user.role !== "admin") {
    return NextResponse.json({ code: "FORBIDDEN", error: "Admin role required." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = recurringExamsPayloadSchema.safeParse(body);
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

    // E2 lock: only allow recurring exam generation when prerequisites are complete.
    await assertSetupStepReadyOrThrow(schoolId, "dsRecurringExams");

    const requestId = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          schoolId,
          termId: validated.data.termId,
          loops: validated.data.loops,
          strictMode: validated.data.strictMode ?? true,
          maxScore: validated.data.maxScore,
          weight: validated.data.weight,
          titlePrefix: validated.data.titlePrefix ?? null,
        })
      )
      .digest("hex")
      .slice(0, 16);

    const preview = await expandRecurringExamLoops({
      schoolId,
      payload: validated.data,
      requestId,
    });

    return NextResponse.json(preview, { status: 200 });
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

    console.error("[E3_RECURRING_EXAMS_PREVIEW]", err);
    return NextResponse.json({ code: "SERVER_ERROR", error: "Internal Server Error" }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { timetableAssistantSchoolBodySchema } from "@/lib/formValidationSchemas";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import { runTimetableAssistantSchoolPreviewOptimize } from "@/lib/timetableAssistantService";

function httpStatusForOptimizeCode(code: string): number {
  if (code === "SOLVER_DISABLED" || code === "SOLVER_UNAVAILABLE") return 503;
  if (code === "SOLVER_TIMEOUT") return 504;
  return 400;
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = timetableAssistantSchoolBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const result = await runTimetableAssistantSchoolPreviewOptimize({ schoolId, body: parsed.data });
  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, error: result.error },
      { status: httpStatusForOptimizeCode(result.code) }
    );
  }

  return NextResponse.json(result.data, { status: 200 });
}

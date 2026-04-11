import { NextRequest, NextResponse } from "next/server";
import { timetableAssistantSchoolBodySchema } from "@/lib/formValidationSchemas";
import { requireSchoolAccess, type AuthUser } from "@/lib/auth";
import { runTimetableAssistantSchoolPreview } from "@/lib/timetableAssistantService";

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

  const result = await runTimetableAssistantSchoolPreview({ schoolId, body: parsed.data });
  if (!result.ok) {
    return NextResponse.json({ code: result.code, error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.data, { status: 200 });
}

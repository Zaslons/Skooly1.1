import { NextRequest, NextResponse } from "next/server";
import { requireSchoolAccess } from "@/lib/auth";
import { getSchedulingSetupStatus } from "@/lib/domain/temporalRules";

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ error: "School ID is required." }, { status: 400 });
  }

  const userOrResponse = await requireSchoolAccess(request, schoolId);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const status = await getSchedulingSetupStatus(schoolId);
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    console.error("[SCHEDULING_STATUS_GET]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

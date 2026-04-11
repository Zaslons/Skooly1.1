import Announcements from "@/components/Announcements";
import ParentDashboardClient from "@/components/parent/ParentDashboardClient";
import type { ParentDashboardItem } from "@/components/parent/types";
import prisma from "@/lib/prisma";
import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser, getActiveSchoolIdsForUser } from "@/lib/schoolAccess";
import { getStudentAcademicSummary, type StudentAcademicSummary } from "@/lib/gradeCalculation";

function toParentDashboardItems(
  childSummaries: Array<{
    student: {
      id: string;
      name: string;
      surname: string;
      classId: number | null;
      schoolId: string;
      school: { name: string };
    };
    summary: StudentAcademicSummary | null;
    periods: Array<{
      id: string;
      name: string;
      order: number;
      startTime: Date;
      endTime: Date;
    }>;
  }>
): ParentDashboardItem[] {
  return childSummaries.map(({ student, summary, periods }) => ({
    studentId: student.id,
    displayName: `${student.name} ${student.surname}`.trim(),
    schoolName: student.school.name,
    classId: student.classId,
    schoolId: student.schoolId,
    summary,
    periods: periods.map((p) => ({
      id: p.id,
      name: p.name,
      order: p.order,
      startTime: p.startTime instanceof Date ? p.startTime.toISOString() : String(p.startTime),
      endTime: p.endTime instanceof Date ? p.endTime.toISOString() : String(p.endTime),
    })),
  }));
}

const ParentPage = async ({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) => {
  const { schoolId } = await params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  if (authUser.role !== "parent") {
    return <div>Access Denied: This page is for parents only.</div>;
  }

  const parent = await prisma.parent.findUnique({
    where: { authId: authUser.id },
    select: { id: true },
  });

  if (!parent) {
    return <div className="p-4">Parent profile not found.</div>;
  }

  const allowedSchoolIds = await getActiveSchoolIdsForUser(authUser.id, "parent");
  const schoolIdsForStudents = allowedSchoolIds.length > 0 ? allowedSchoolIds : [schoolId];

  const students = await prisma.student.findMany({
    where: {
      parentId: parent.id,
      schoolId: { in: schoolIdsForStudents },
    },
    select: {
      id: true,
      name: true,
      surname: true,
      classId: true,
      schoolId: true,
      school: { select: { name: true } },
    },
  });

  type StudentRow = (typeof students)[number];
  const childSummaries: {
    student: StudentRow;
    summary: StudentAcademicSummary | null;
    periods: { id: string; name: string; order: number; startTime: Date; endTime: Date }[];
  }[] = await Promise.all(
    students.map(async (student) => {
      const [activeAY, periods] = await Promise.all([
        prisma.academicYear.findFirst({
          where: { schoolId: student.schoolId, isArchived: false },
          orderBy: { startDate: "desc" },
        }),
        prisma.period.findMany({
          where: { schoolId: student.schoolId, isArchived: false },
          select: { id: true, name: true, order: true, startTime: true, endTime: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
        }),
      ]);
      const summary = activeAY
        ? await getStudentAcademicSummary(student.id, activeAY.id, student.schoolId)
        : null;
      return { student, summary, periods };
    })
  );

  const items = toParentDashboardItems(childSummaries);

  return (
    <div className="p-4 flex gap-4 flex-col xl:flex-row">
      <div className="w-full xl:w-2/3 flex flex-col gap-4">
        <ParentDashboardClient items={items} />
      </div>
      <div className="w-full xl:w-1/3 flex flex-col gap-8">
        <Announcements schoolId={schoolId} />
      </div>
    </div>
  );
};

export default ParentPage;

import prisma from "@/lib/prisma";
import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import { getSchedulingReadiness } from "@/lib/domain/temporalRules";
import RecurringExamBuilder from "@/components/scheduling/RecurringExamBuilder";

export default async function RecurringExamsSetupPage({
  params,
}: {
  params: { schoolId: string };
}) {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated. Please sign in.</div>;
  }
  if (authUser.role !== "admin") {
    return <div>Access Denied: This page is for administrators only.</div>;
  }
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  const readiness = await getSchedulingReadiness(schoolId);

  const terms = await prisma.term.findMany({
    where: { schoolId, isArchived: false },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  const initialTermId = readiness.activeTermId ?? terms[0]?.id ?? null;

  const classes = await prisma.class.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const subjects = await prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    orderBy: [{ surname: "asc" }, { name: "asc" }],
    select: { id: true, name: true, surname: true },
  });

  const rooms = await prisma.room.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <RecurringExamBuilder
      schoolId={schoolId}
      terms={terms}
      initialTermId={initialTermId}
      classes={classes}
      subjects={subjects}
      teachers={teachers}
      rooms={rooms}
    />
  );
}


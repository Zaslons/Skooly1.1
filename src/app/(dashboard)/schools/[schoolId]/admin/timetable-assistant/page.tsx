import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import prisma from "@/lib/prisma";
import TimetableAssistantClient from "./TimetableAssistantClient";

const TimetableAssistantPage = async ({ params }: { params: { schoolId: string } }) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div>Access denied.</div>;
  }
  if (authUser.role !== "admin") {
    return <div>This page is for administrators only.</div>;
  }

  const [classes, subjects, teachers, rooms, periodCount] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId, academicYear: { isArchived: false } },
      select: { id: true, name: true, grade: { select: { level: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.subject.findMany({
      where: { schoolId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.teacher.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        surname: true,
        subjects: { select: { id: true } },
      },
      orderBy: [{ surname: "asc" }, { name: "asc" }],
    }),
    prisma.room.findMany({
      where: { schoolId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.period.count({ where: { schoolId, isArchived: false } }),
  ]);

  const teacherOptions = teachers.map((t) => ({
    id: t.id,
    name: t.name,
    surname: t.surname,
    subjectIds: t.subjects.map((s) => s.id),
  }));

  const optimizerEnabled = process.env.TIMETABLE_SOLVER_ENABLED === "1";

  return (
    <TimetableAssistantClient
      schoolId={schoolId}
      classes={classes.map((c) => ({
        id: c.id,
        label: c.grade ? `${c.name} (${c.grade.level})` : c.name,
      }))}
      subjects={subjects}
      teachers={teacherOptions}
      rooms={rooms}
      hasBellPeriods={periodCount > 0}
      optimizerEnabled={optimizerEnabled}
    />
  );
};

export default TimetableAssistantPage;

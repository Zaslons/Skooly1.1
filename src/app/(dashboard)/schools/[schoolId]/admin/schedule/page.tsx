import prisma from "@/lib/prisma";
import AdminScheduleClient from "./AdminScheduleClient"; // Assuming client component is in the same folder
import { getVerifiedAuthUser } from "@/lib/actions"; // Import auth function
import { assertSchoolAccessForServerUser, teacherWhereInSchool } from "@/lib/schoolAccess";
import { getSchedulingReadiness, getSchedulingSetupStatus } from "@/lib/domain/temporalRules";

// Function to fetch initial data needed by the schedule (lessons and related data for forms)
async function getScheduleInitialData(schoolId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { schoolId: schoolId },
    include: {
      subject: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true, surname: true, subjects: { select: { id: true } } } },
      period: { select: { id: true, name: true } },
      endPeriod: { select: { id: true, name: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  // Data needed for the LessonForm within the modal
  const subjects = await prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
  const grades = await prisma.grade.findMany({ where: { schoolId }, orderBy: { level: 'asc' } });
  const classes = await prisma.class.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
  const teachers = await prisma.teacher.findMany({
    where: teacherWhereInSchool(schoolId),
    include: { subjects: { select: { id: true } } }, // For filtering teachers by subject in LessonForm
    orderBy: [{ surname: 'asc' }, { name: 'asc' }],
  });
  const rooms = await prisma.room.findMany({
    where: { schoolId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const periods = await prisma.period.findMany({
    where: { schoolId, isArchived: false },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, startTime: true, endTime: true, order: true },
  });

  return { 
    lessons: JSON.parse(JSON.stringify(lessons)),
    relatedData: {
      subjects: JSON.parse(JSON.stringify(subjects)),
      grades: JSON.parse(JSON.stringify(grades)),
      classes: JSON.parse(JSON.stringify(classes)),
      teachers: JSON.parse(JSON.stringify(teachers)),
      rooms: JSON.parse(JSON.stringify(rooms)),
      periods: JSON.parse(JSON.stringify(periods)),
      periodsOnly: periods.length > 0,
      schoolId: schoolId,
    }
  };
}

const AdminSchedulePage = async ({ params }: { params: { schoolId: string } }) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser(); // Fetch authenticated user

  // Authentication and Authorization checks
  if (!authUser) {
    // Not authenticated, redirect to sign-in
    // return redirect(`/sign-in?redirect=/schools/${schoolId}/admin/schedule`); // Or your sign-in page
    return <div>User not authenticated. Please sign in.</div>; // Or a more user-friendly component
  }
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }
  if (authUser.role !== 'admin') {
    return <div>Access Denied: This page is for administrators only.</div>;
  }

  const { lessons, relatedData } = await getScheduleInitialData(schoolId);
  const schedulingReadiness = await getSchedulingReadiness(schoolId);
  const setupStatus = await getSchedulingSetupStatus(schoolId);

  const activeTermId =
    schedulingReadiness.activeTermId ?? setupStatus.ids?.activeTermId ?? null;
  let activeTermDisplay: string | null = null;
  if (activeTermId) {
    const termRow = await prisma.term.findFirst({
      where: { id: activeTermId, schoolId },
      select: { name: true, academicYear: { select: { name: true } } },
    });
    if (termRow) {
      activeTermDisplay = `${termRow.name} (${termRow.academicYear.name})`;
    }
  }

  return (
    <AdminScheduleClient 
      initialLessons={lessons} 
      initialRelatedData={relatedData}
      authUser={authUser} // Pass authUser to the client component
      schedulingReadiness={schedulingReadiness}
      setupStatus={setupStatus}
      activeTermDisplay={activeTermDisplay}
    />
  );
};

export default AdminSchedulePage; 
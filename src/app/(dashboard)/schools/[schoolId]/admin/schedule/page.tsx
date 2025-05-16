import prisma from "@/lib/prisma";
import AdminScheduleClient from "./AdminScheduleClient"; // Assuming client component is in the same folder
import { getVerifiedAuthUser } from "@/lib/actions"; // Import auth function
import { redirect } from "next/navigation"; // For redirects

// Function to fetch initial data needed by the schedule (lessons and related data for forms)
async function getScheduleInitialData(schoolId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { schoolId: schoolId },
    include: {
      subject: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true, surname: true, subjects: { select: { id: true } } } },
    },
    orderBy: { startTime: 'asc' },
  });

  // Data needed for the LessonForm within the modal
  const subjects = await prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
  const classes = await prisma.class.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    include: { subjects: { select: { id: true } } }, // For filtering teachers by subject in LessonForm
    orderBy: [{ surname: 'asc' }, { name: 'asc' }],
  });

  return { 
    lessons: JSON.parse(JSON.stringify(lessons)), // Serialize dates for client component
    relatedData: {
      subjects: JSON.parse(JSON.stringify(subjects)),
      classes: JSON.parse(JSON.stringify(classes)),
      teachers: JSON.parse(JSON.stringify(teachers)),
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
  if (authUser.schoolId !== schoolId) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }
  if (authUser.role !== 'admin') {
    return <div>Access Denied: This page is for administrators only.</div>;
  }

  const { lessons, relatedData } = await getScheduleInitialData(schoolId);

  return (
    <AdminScheduleClient 
      initialLessons={lessons} 
      initialRelatedData={relatedData}
      authUser={authUser} // Pass authUser to the client component
    />
  );
};

export default AdminSchedulePage; 
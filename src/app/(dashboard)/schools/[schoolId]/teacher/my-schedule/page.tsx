import prisma from "@/lib/prisma";
import { getVerifiedAuthUser, getTeacherLessons } from "@/lib/actions"; 
import { redirect } from "next/navigation";
import MyScheduleClient from "./MyScheduleClient";
import { Day, Lesson as PrismaLesson, Subject as PrismaSubject, Class as PrismaClass } from "@prisma/client"; // For sorting

// Define the shape of the included relations
interface IncludedSubject { id: number; name: string; }
interface IncludedClass { id: number; name: string; }

// Helper type for the data passed to the client component.
// getTeacherLessons returns Lesson objects with subject and class included.
// These are then stringified, so Date fields become strings.
export type TeacherLesson = Pick<PrismaLesson, 'id' | 'name' | 'day'> & {
  startTime: string; // Date is stringified
  endTime: string;   // Date is stringified
  subject: IncludedSubject;
  class: IncludedClass;
};

export interface SchedulePageRelatedData {
  teachers: {
    id: string;
    name: string;
    surname: string;
    subjects: { id: number }[]; // Added subjects for filtering swap suggestions
  }[];
}

async function getPageData(schoolId: string, teacherId: string) {
  const lessons = await getTeacherLessons(teacherId, schoolId);

  // Fetch other teachers in the same school for swap suggestions, excluding the current teacher
  const otherTeachers = await prisma.teacher.findMany({
    where: { 
      schoolId: schoolId,
      id: { not: teacherId } 
    },
    select: { 
      id: true, 
      name: true, 
      surname: true, 
      subjects: { select: { id: true } } // Include subject IDs taught by the teacher
    },
    orderBy: [{ surname: 'asc' }, { name: 'asc' }],
  });
  
  // Serialize date fields if not already handled by getTeacherLessons
  // For now, assuming getTeacherLessons returns serializable data or client handles it.
  // It's good practice to JSON.parse(JSON.stringify(lessons)) if dates are direct from Prisma.
  // However, getTeacherLessons should already return plain objects if it's well-behaved.

  return {
    lessons: JSON.parse(JSON.stringify(lessons)) as TeacherLesson[], // Ensure dates are serialized
    relatedData: {
      teachers: otherTeachers,
    } as SchedulePageRelatedData,
  };
}

const MyTeacherSchedulePage = async ({ params }: { params: { schoolId: string } }) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    // Redirect to sign-in or show an appropriate message
    return redirect(`/sign-in?redirect=/schools/${schoolId}/teacher/my-schedule`);
  }
  if (authUser.role !== 'teacher') {
    return <div className="p-4">Access Denied: This page is for teachers only.</div>;
  }
  if (authUser.schoolId !== schoolId) {
    return <div className="p-4">Access Denied: You are not authorized for this school's schedule.</div>;
  }
  if (!authUser.profileId) {
    return <div className="p-4">Error: Teacher profile ID not found.</div>;
  }

  const { lessons, relatedData } = await getPageData(schoolId, authUser.profileId);

  // Group lessons by day for easier display
  const lessonsByDay: Record<Day, TeacherLesson[]> = {
    MONDAY: [], TUESDAY: [], WEDNESDAY: [], THURSDAY: [], FRIDAY: [], SATURDAY: [], SUNDAY: []
  };

  lessons.forEach(lesson => {
    // Assuming lesson.day is of type Day enum
    if (lesson.day && lessonsByDay[lesson.day as Day]) { // Added 'as Day' for safety, though lesson.day should be Day
      lessonsByDay[lesson.day as Day].push(lesson);
    }
  });
  
  // Sort lessons within each day by start time
  for (const dayKey in lessonsByDay) {
    const day = dayKey as Day;
    lessonsByDay[day].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }


  return (
    <MyScheduleClient
      initialLessonsByDay={lessonsByDay}
      relatedData={relatedData}
      authUser={authUser}
      schoolId={schoolId}
    />
  );
};

export default MyTeacherSchedulePage; 
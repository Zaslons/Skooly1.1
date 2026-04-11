import prisma from "@/lib/prisma";
import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import { redirect } from "next/navigation";
import MyScheduleClient from "./MyScheduleClient";
import { Lesson as PrismaLesson } from "@prisma/client";

/** Template lesson context for schedule-change requests (IDs align with weekly `Lesson` rows). */
export type TeacherLesson = Pick<PrismaLesson, "id" | "name" | "day"> & {
  startTime: string;
  endTime: string;
  subject: { id: number; name: string };
  class: { id: number; name: string };
};

export interface SchedulePageRelatedData {
  teachers: {
    id: string;
    name: string;
    surname: string;
    subjects: { id: number }[]; // Added subjects for filtering swap suggestions
  }[];
  periods: {
    id: string;
    name: string;
    order: number;
    startTime: string;
    endTime: string;
  }[];
}

async function getPageData(schoolId: string, teacherId: string) {
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
  const periods = await prisma.period.findMany({
    where: { schoolId, isArchived: false },
    select: { id: true, name: true, order: true, startTime: true, endTime: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return {
    relatedData: {
      teachers: otherTeachers,
      periods: periods.map((p) => ({
        ...p,
        startTime: p.startTime.toISOString(),
        endTime: p.endTime.toISOString(),
      })),
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
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div className="p-4">Access Denied: You are not authorized for this school&apos;s schedule.</div>;
  }
  if (!authUser.profileId) {
    return <div className="p-4">Error: Teacher profile ID not found.</div>;
  }

  const { relatedData } = await getPageData(schoolId, authUser.profileId);

  return (
    <MyScheduleClient
      relatedData={relatedData}
      authUser={authUser}
      schoolId={schoolId}
    />
  );
};

export default MyTeacherSchedulePage; 
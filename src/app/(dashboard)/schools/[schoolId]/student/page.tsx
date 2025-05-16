import Announcements from "@/components/Announcements";
import BigCalendarContainer from "@/components/BigCalendarContainer";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import prisma from "@/lib/prisma";
import { getVerifiedAuthUser } from "@/lib/actions";

const StudentPage = async ({
  params,
}: {
  params: { schoolId: string };
}) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (authUser.schoolId !== schoolId) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  if (authUser.role !== 'student') {
    return <div>Access Denied: This page is for students only.</div>;
  }

  const student = await prisma.student.findUnique({
    where: { authId: authUser.id, schoolId: schoolId },
    select: { classId: true, name: true, surname: true }
  });

  if (!student || !student.classId) {
    return <div>Student details or class assignment not found for the current user.</div>;
  }

  return (
    <div className="p-4 flex gap-4 flex-col xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3">
        <div className="h-full bg-white p-4 rounded-md">
          <h1 className="text-xl font-semibold">Schedule ({student.name} {student.surname})</h1>
          <BigCalendarContainer
            type="classId"
            id={student.classId}
            schoolId={schoolId}
          />
        </div>
      </div>
      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-8">
        <EventCalendar />
        <Announcements schoolId={schoolId} />
      </div>
    </div>
  );
};

export default StudentPage;

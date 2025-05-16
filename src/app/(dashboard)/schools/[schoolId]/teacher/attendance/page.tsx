import { getTeacherLessons } from "@/lib/data";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getVerifiedAuthUser } from "@/lib/actions";

export default async function TeacherAttendancePage({ 
    params
}: { 
    params: { schoolId: string }
}) {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (authUser.schoolId !== schoolId) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  if (authUser.role !== 'teacher') {
    return <div>Access Denied: This page is for teachers only.</div>;
  }

  const lessons = await getTeacherLessons(authUser.id, schoolId);

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Attendance Management</h1>
        <p className="text-gray-600">
          View and manage attendance for your classes
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.length === 0 ? (
          <div className="col-span-full text-center p-6 bg-white rounded-lg shadow">
            <p className="text-gray-600">You have no assigned lessons</p>
          </div>
        ) : (
          lessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/schools/${schoolId}/teacher/attendance/${lesson.id}`}
              className="bg-white p-5 rounded-lg shadow hover:shadow-md transition-shadow duration-200 flex flex-col"
            >
              <div className="flex items-center mb-4">
                <div className="bg-blue-100 p-2 rounded-full mr-3">
                  <CalendarClock className="text-blue-600 h-5 w-5" />
                </div>
                <h2 className="font-semibold text-lg">{lesson.name}</h2>
              </div>

              <div className="text-sm text-gray-600 mb-3">
                <p>Day: {lesson.day}</p>
                <p>
                  Time: {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
                </p>
              </div>

              <div className="mt-auto pt-3 border-t border-gray-100">
                <p className="text-sm font-medium">
                  Class: {lesson.class.name} / Subject: {lesson.subject.name}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// Helper function to format time
function formatTime(dateString: string | Date) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
} 
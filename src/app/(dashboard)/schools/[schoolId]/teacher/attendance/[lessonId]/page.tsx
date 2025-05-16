import { getLessonById, getAttendanceHistory } from "@/lib/data";
import Link from "next/link";
import { Pencil, Plus, ArrowLeft, CalendarRange } from "lucide-react";
import FormModal from "@/components/FormModal";
import FormContainer from "@/components/FormContainer";
import { format } from "date-fns";
import { getVerifiedAuthUser } from "@/lib/actions";

export default async function LessonAttendancePage({
  params,
}: {
  params: { lessonId: string; schoolId: string };
}) {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser || !authUser.id) {
    return <div>User not authenticated or not properly loaded.</div>;
  }

  const lessonId = parseInt(params.lessonId);
  const lesson = await getLessonById(lessonId, schoolId);
  
  if (!lesson) {
    return <div className="p-4">Lesson not found (or not in this school)</div>;
  }

  // Check if the current teacher is authorized to access this lesson
  if (!lesson.teacher || lesson.teacher.authId !== authUser.id) {
    return <div className="p-4">You are not authorized to view this lesson</div>;
  }

  const attendanceHistory = await getAttendanceHistory(lessonId, schoolId);

  return (
    <div className="p-4">
      <div className="flex items-center mb-6">
        <Link 
          href={`/schools/${schoolId}/teacher/attendance`} 
          className="mr-3 p-2 rounded-full hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{lesson.name}</h1>
          <p className="text-gray-600">
            {lesson.subject.name} - Class {lesson.class.name}
          </p>
        </div>
      </div>

      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Attendance Records</h2>
        <FormContainer
          table="attendance"
          type="create"
          data={{ lessonId }}
          authUser={authUser}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {attendanceHistory.length === 0 ? (
          <div className="col-span-full text-center p-6 bg-white rounded-lg shadow">
            <CalendarRange className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-gray-600">No attendance records found</p>
            <p className="text-sm text-gray-500 mt-1">
              Use the &quot;Take Attendance&quot; button to start recording attendance
            </p>
          </div>
        ) : (
          attendanceHistory.map((record, index) => (
            <div
              key={index}
              className="bg-white p-5 rounded-lg shadow hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center">
                  <div className="bg-blue-100 p-2 rounded-full mr-3">
                    <CalendarRange className="text-blue-600 h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">
                    {format(new Date(record.date), "MMMM d, yyyy")}
                  </h3>
                </div>
                <FormContainer
                  table="attendance"
                  type="update"
                  data={{
                    lessonId,
                    date: record.date,
                  }}
                  authUser={authUser}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 
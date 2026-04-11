import Announcements from "@/components/Announcements";
import ReadonlyPeriodGridContainer from "@/components/scheduling/period-grid/ReadonlyPeriodGridContainer";
import EventCalendar from "@/components/EventCalendar";
import prisma from "@/lib/prisma";
import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import { getStudentAcademicSummary } from "@/lib/gradeCalculation";

const StudentPage = async ({
  params,
}: {
  params: { schoolId: string };
}) => {
  const { schoolId } = await params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  if (authUser.role !== 'student') {
    return <div>Access Denied: This page is for students only.</div>;
  }

  const student = await prisma.student.findUnique({
    where: { authId: authUser.id, schoolId: schoolId },
    select: { id: true, classId: true, name: true, surname: true }
  });

  if (!student || !student.classId) {
    return <div>Student details or class assignment not found for the current user.</div>;
  }

  const activeAY = await prisma.academicYear.findFirst({
    where: { schoolId, isArchived: false },
    orderBy: { startDate: 'desc' },
  });

  const summary = activeAY
    ? await getStudentAcademicSummary(student.id, activeAY.id, schoolId)
    : null;
  const periods = await prisma.period.findMany({
    where: { schoolId, isArchived: false },
    select: { id: true, name: true, order: true, startTime: true, endTime: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-4 flex gap-4 flex-col xl:flex-row">
      <div className="w-full xl:w-2/3 flex flex-col gap-4">
        {summary && (
          <div className="bg-white p-6 rounded-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Academic Summary</h2>
              {summary.gradeBand && (
                <span
                  className="px-3 py-1 rounded-full text-sm font-semibold"
                  style={{ backgroundColor: summary.gradeBand.color || '#e5e7eb', color: summary.gradeBand.color ? '#fff' : '#374151' }}
                >
                  {summary.gradeBand.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{summary.overallAverage.toFixed(1)}%</p>
                <p className="text-xs text-blue-600">Overall Average</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{summary.attendanceRate.toFixed(0)}%</p>
                <p className="text-xs text-green-600">Attendance</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-700">{summary.subjectGrades.length}</p>
                <p className="text-xs text-purple-600">Subjects</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${summary.failedSubjectCount > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <p className={`text-2xl font-bold ${summary.failedSubjectCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {summary.failedSubjectCount}
                </p>
                <p className={`text-xs ${summary.failedSubjectCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Failed Subjects</p>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-gray-700 mb-3">Subject Grades</h3>
            <div className="space-y-2">
              {summary.subjectGrades.map(sg => (
                <div key={sg.subjectId} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm">{sg.subjectName}</span>
                    {sg.coefficient !== 1.0 && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">x{sg.coefficient}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${sg.isPassing ? 'text-green-700' : 'text-red-700'}`}>
                      {sg.weightedAverage.toFixed(1)}%
                    </span>
                    <span className={`w-2 h-2 rounded-full ${sg.isPassing ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
              <div className="bg-green-50 rounded-lg p-2">
                <p className="font-bold text-green-700">{summary.totalPresent}</p>
                <p className="text-green-600">Present</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <p className="font-bold text-red-700">{summary.totalAbsent}</p>
                <p className="text-red-600">Absent</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-2">
                <p className="font-bold text-yellow-700">{summary.totalLate}</p>
                <p className="text-yellow-600">Late</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-4 rounded-md">
          <h1 className="text-xl font-semibold">Schedule ({student.name} {student.surname})</h1>
          <ReadonlyPeriodGridContainer
            scope="classId"
            id={student.classId}
            schoolId={schoolId}
            periods={periods}
          />
        </div>
      </div>
      <div className="w-full xl:w-1/3 flex flex-col gap-8">
        <EventCalendar />
        <Announcements schoolId={schoolId} />
      </div>
    </div>
  );
};

export default StudentPage;

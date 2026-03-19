import Announcements from "@/components/Announcements";
import BigCalendarContainer from "@/components/BigCalendarContainer";
import prisma from "@/lib/prisma";
import { getVerifiedAuthUser } from "@/lib/actions";
import { getStudentAcademicSummary, type StudentAcademicSummary } from "@/lib/gradeCalculation";

const ParentPage = async ({ 
    params
}: {
    params: { schoolId: string }
}) => {
  const { schoolId } = await params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (authUser.schoolId !== schoolId) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  if (authUser.role !== 'parent') {
    return <div>Access Denied: This page is for parents only.</div>;
  }
  
  const parent = await prisma.parent.findFirst({
    where: { authId: authUser.id, schoolId },
    select: { id: true },
  });

  const students = await prisma.student.findMany({
    where: {
      parentId: parent?.id || authUser.id,
      schoolId: schoolId,
    },
    select: { id: true, name: true, surname: true, classId: true },
  });

  const activeAY = await prisma.academicYear.findFirst({
    where: { schoolId, isArchived: false },
    orderBy: { startDate: 'desc' },
  });

  const childSummaries: { student: typeof students[0]; summary: StudentAcademicSummary | null }[] = [];
  for (const student of students) {
    const summary = activeAY
      ? await getStudentAcademicSummary(student.id, activeAY.id, schoolId)
      : null;
    childSummaries.push({ student, summary });
  }

  return (
    <div className="p-4 flex gap-4 flex-col xl:flex-row">
      <div className="w-full xl:w-2/3 flex flex-col gap-4">
        {childSummaries.map(({ student, summary }) => (
          <div key={student.id} className="bg-white rounded-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{student.name} {student.surname}</h2>
                {summary && (
                  <p className="text-sm text-gray-500">
                    {summary.subjectGrades.length} subjects &middot; {summary.failedSubjectCount} failing
                  </p>
                )}
              </div>
              {summary?.gradeBand && (
                <span
                  className="px-3 py-1 rounded-full text-sm font-semibold"
                  style={{ backgroundColor: summary.gradeBand.color || '#e5e7eb', color: summary.gradeBand.color ? '#fff' : '#374151' }}
                >
                  {summary.gradeBand.label}
                </span>
              )}
            </div>

            {summary ? (
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-blue-700">{summary.overallAverage.toFixed(1)}%</p>
                    <p className="text-xs text-blue-600">Average</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-700">{summary.attendanceRate.toFixed(0)}%</p>
                    <p className="text-xs text-green-600">Attendance</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-700">{summary.totalPresent}</p>
                    <p className="text-xs text-green-600">Present</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-red-700">{summary.totalAbsent}</p>
                    <p className="text-xs text-red-600">Absent</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {summary.subjectGrades.map(sg => (
                    <div key={sg.subjectId} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                      <span className="font-medium">{sg.subjectName}</span>
                      <span className={`font-semibold ${sg.isPassing ? 'text-green-700' : 'text-red-700'}`}>
                        {sg.weightedAverage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-gray-400 text-sm">No academic data available yet.</div>
            )}

            {student.classId && (
              <div className="px-6 pb-4">
                <h3 className="text-sm font-semibold mb-2">Schedule</h3>
                <BigCalendarContainer type="classId" id={student.classId} schoolId={schoolId} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="w-full xl:w-1/3 flex flex-col gap-8">
        <Announcements schoolId={schoolId} />
      </div>
    </div>
  );
};

export default ParentPage;

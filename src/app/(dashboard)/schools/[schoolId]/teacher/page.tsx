import Announcements from "@/components/Announcements";
import BigCalendarContainer from "@/components/BigCalendarContainer";
import { getVerifiedAuthUser } from "@/lib/actions";
import prisma from "@/lib/prisma";
import { getClassAcademicSummary } from "@/lib/gradeCalculation";

const TeacherPage = async ({
  params,
}: {
  params: { schoolId: string };
}) => {
  const { schoolId } = await params;
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

  const activeAY = await prisma.academicYear.findFirst({
    where: { schoolId, isArchived: false },
    orderBy: { startDate: 'desc' },
  });

  const teacherClasses = await prisma.lesson.findMany({
    where: { teacherId: authUser.id, schoolId },
    select: { classId: true, class: { select: { id: true, name: true, academicYearId: true } } },
    distinct: ['classId'],
  });

  const uniqueClasses = teacherClasses
    .filter(l => l.class && activeAY && l.class.academicYearId === activeAY.id)
    .map(l => l.class!);

  const classPerformance: { className: string; classAvg: number; studentCount: number; struggling: { name: string; avg: number }[] }[] = [];

  if (activeAY) {
    for (const cls of uniqueClasses) {
      const summaries = await getClassAcademicSummary(cls.id, activeAY.id, schoolId);
      const avgTotal = summaries.reduce((s, st) => s + st.overallAverage, 0);
      const classAvg = summaries.length > 0 ? avgTotal / summaries.length : 0;
      const struggling = summaries
        .filter(s => s.overallAverage < 50)
        .map(s => ({ name: s.studentName, avg: s.overallAverage }));

      classPerformance.push({
        className: cls.name,
        classAvg,
        studentCount: summaries.length,
        struggling,
      });
    }
  }

  return (
    <div className="flex-1 p-4 flex gap-4 flex-col xl:flex-row">
      <div className="w-full xl:w-2/3 flex flex-col gap-4">
        {classPerformance.length > 0 && (
          <div className="bg-white p-6 rounded-md">
            <h2 className="text-lg font-semibold mb-4">Class Performance Overview</h2>
            <div className="space-y-4">
              {classPerformance.map(cp => (
                <div key={cp.className} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{cp.className}</h3>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">{cp.studentCount} students</span>
                      <span className={`font-bold ${cp.classAvg >= 50 ? 'text-green-700' : 'text-red-700'}`}>
                        Avg: {cp.classAvg.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-200 h-2 rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full ${cp.classAvg >= 70 ? 'bg-green-500' : cp.classAvg >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(cp.classAvg, 100)}%` }}
                    />
                  </div>
                  {cp.struggling.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-600 mb-1">Students below passing ({cp.struggling.length}):</p>
                      <div className="flex flex-wrap gap-2">
                        {cp.struggling.map(s => (
                          <span key={s.name} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded">
                            {s.name} ({s.avg.toFixed(1)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white p-4 rounded-md">
          <h1 className="text-xl font-semibold">Schedule</h1>
          {authUser && (
            <BigCalendarContainer
              type="teacherId"
              id={authUser.id}
              schoolId={schoolId}
            />
          )}
        </div>
      </div>
      <div className="w-full xl:w-1/3 flex flex-col gap-8">
        <Announcements schoolId={schoolId} />
      </div>
    </div>
  );
};

export default TeacherPage;

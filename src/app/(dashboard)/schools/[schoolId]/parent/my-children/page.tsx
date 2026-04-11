import prisma from '@/lib/prisma';
import { getServerUser } from '@/lib/auth';
import { assertSchoolAccessForServerUser, getActiveSchoolIdsForUser } from '@/lib/schoolAccess';
import { redirect } from 'next/navigation';
import ParentFilteredLayout from '@/components/parent/ParentFilteredLayout';

export default async function MyChildrenPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  const user = await getServerUser();

  if (!user || user.role !== 'parent' || !(await assertSchoolAccessForServerUser(user, schoolId))) {
    redirect('/');
  }

  const parent = await prisma.parent.findUnique({
    where: { authId: user.id },
    select: { id: true },
  });

  if (!parent) {
    return <div className="p-6 text-gray-500">Parent profile not found.</div>;
  }

  const allowedSchoolIds = await getActiveSchoolIdsForUser(user.id, 'parent');
  const schoolIdsForStudents = allowedSchoolIds.length > 0 ? allowedSchoolIds : [schoolId];

  const students = await prisma.student.findMany({
    where: { parentId: parent.id, schoolId: { in: schoolIdsForStudents } },
    include: {
      school: { select: { name: true } },
      class: {
        include: {
          grade: { select: { level: true } },
          academicYear: { select: { name: true } },
          lessons: {
            include: {
              subject: { select: { name: true } },
              teacher: { select: { name: true, surname: true, email: true, phone: true } },
            },
            distinct: ['subjectId'],
          },
        },
      },
    },
  });

  const distinctSchools = new Set(students.map((s) => s.school.name));
  const showSchoolInChips = distinctSchools.size > 1;
  const myChildrenFilterOptions = students.map((s) => ({
    id: s.id,
    label: `${s.name} ${s.surname}`,
    sublabel: showSchoolInChips ? s.school.name : undefined,
  }));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">My Children</h1>
      <p className="text-gray-500 mb-6">View your children&apos;s class information and teachers.</p>

      {students.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No children registered yet.
        </div>
      )}

      {students.length > 0 && (
        <ParentFilteredLayout
          filterOptions={myChildrenFilterOptions}
          contentClassName="space-y-6"
        >
          {students.map((student) => (
            <div
              key={student.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              {...{ 'data-student-filter-id': student.id }}
            >
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-0.5">
                  {student.school.name}
                </p>
                <h2 className="text-lg font-semibold text-gray-900">
                  {student.name} {student.surname}
                </h2>
                {student.class ? (
                  <p className="text-sm text-gray-600 mt-0.5">
                    {student.class.name} &middot; {student.class.grade?.level} &middot; {student.class.academicYear?.name}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 mt-0.5">Not assigned to a class</p>
                )}
              </div>

              {student.class && student.class.lessons.length > 0 && (
                <div className="px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Subjects & Teachers</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {student.class.lessons.map(lesson => (
                      <div key={lesson.id} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                        <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {lesson.subject.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-gray-900">{lesson.subject.name}</p>
                          <p className="text-sm text-gray-600">
                            {lesson.teacher.name} {lesson.teacher.surname}
                          </p>
                          {lesson.teacher.email && (
                            <p className="text-xs text-gray-400">{lesson.teacher.email}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {student.class && student.class.lessons.length === 0 && (
                <div className="px-6 py-4 text-sm text-gray-400">No lessons scheduled yet for this class.</div>
              )}

              {!student.class && (
                <div className="px-6 py-4 text-sm text-gray-400">This student is not currently assigned to a class.</div>
              )}
            </div>
          ))}
        </ParentFilteredLayout>
      )}
    </div>
  );
}

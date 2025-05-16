import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getCurrentUserOnPage } from '@/lib/auth'; // Assuming this helper exists
// import { Badge } from '@/components/ui/badge'; // Temporarily removed
// import { Button as ShadButton } from '@/components/ui/button'; // Temporarily removed

interface ClassesForAcademicYearPageProps {
  params: {
    schoolId: string;
    academicYearId: string;
  };
}

export default async function ClassesForAcademicYearPage({ params }: ClassesForAcademicYearPageProps) {
  const { schoolId, academicYearId } = params;

  const user = await getCurrentUserOnPage();
  if (!user) {
    redirect('/sign-in');
  }
  if (user.role !== 'admin' || user.schoolId !== schoolId) {
    // Or a more specific unauthorized page
    // For now, redirect to a generic unauthorized or home page for their role
    redirect(user.schoolId ? `/schools/${user.schoolId}/${user.role}` : '/'); 
  }

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId, schoolId: schoolId, isArchived: false },
    select: {
      id: true,
      name: true,
    }
  });

  if (!academicYear) {
    notFound(); // Triggers 404 if academic year not found or archived
  }

  const classes = await prisma.class.findMany({
    where: {
      schoolId: schoolId,
      academicYearId: academicYearId,
    },
    include: {
      grade: {
        select: { level: true },
      },
      supervisor: {
        select: { name: true, surname: true },
      },
      _count: { // To get student count efficiently
        select: { students: true } // Counts students directly related via current classId
      }
    },
    orderBy: [
      { grade: { level: 'asc' } },
      { name: 'asc' },
    ],
  });

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Classes for Academic Year: {academicYear.name}
          </h1>
          <p className="text-sm text-gray-500">Manage classes and student enrollments for this academic year.</p>
        </div>
        <Link href={`/schools/${schoolId}/list/classes?action=create&academicYearId=${academicYearId}`} 
              className="mt-3 sm:mt-0 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-semibold">
          Add New Class
        </Link>
      </div>

      {classes.length === 0 ? (
        <div className="text-center py-10 bg-white shadow rounded-lg">
          <p className="text-gray-500 text-lg">No classes found for this academic year.</p>
          <p className="text-sm text-gray-400 mt-2">You can add a new class using the button above.</p>
        </div>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Class Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grade
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supervisor
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Students
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {classes.map((cls) => (
                <tr key={cls.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{cls.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {/* <Badge variant="outline">{cls.grade.level}</Badge> */}
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                      {cls.grade.level}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cls.supervisor ? `${cls.supervisor.name} ${cls.supervisor.surname}` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cls._count.students}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/schools/${schoolId}/academic-years/${academicYearId}/classes/${cls.id}/enrollments`}
                          className="text-indigo-600 hover:text-indigo-800">
                      Manage Enrollments
                    </Link>
                    {/* Add Edit/Delete class buttons here if needed, linking to appropriate class management pages */}
                     {/* <Link href={`/schools/${schoolId}/list/classes/${cls.id}/edit?academicYearId=${academicYearId}`}>
                       <ShadButton variant="link" className="text-blue-600 hover:text-blue-800 ml-2">Edit</ShadButton>
                    </Link> */}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 
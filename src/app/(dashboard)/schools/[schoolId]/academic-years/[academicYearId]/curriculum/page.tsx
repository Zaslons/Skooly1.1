import prisma from '@/lib/prisma';
import { getServerUser } from '@/lib/auth';
import { assertSchoolAccessForServerUser } from '@/lib/schoolAccess';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import CurriculumClient from './CurriculumClient';
import { AcademicYear, Curriculum, CurriculumBook, Grade, Subject } from '@prisma/client';

export type CurriculumWithRelations = Curriculum & {
  grade: Pick<Grade, 'id' | 'level'>;
  subject: Pick<Subject, 'id' | 'name'>;
  books: CurriculumBook[];
};

interface CurriculumPageProps {
  params: {
    schoolId: string;
    academicYearId: string;
  };
  searchParams: { [key: string]: string | string[] | undefined }; // For potential future filtering
}

export default async function CurriculumPage({ params, searchParams }: CurriculumPageProps) {
  const { schoolId, academicYearId } = params;

  // Authentication & Authorization
  const currentUser = await getServerUser();
  if (!currentUser) {
    redirect(`/sign-in?callbackUrl=/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);
  }
  if (currentUser.role !== 'admin' || !(await assertSchoolAccessForServerUser(currentUser, schoolId))) {
    redirect('/(dashboard)');
  }

  // Fetch Academic Year details
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId, schoolId: schoolId, isArchived: false }, // Ensure not archived
  });

  if (!academicYear) {
    // Handle academic year not found or not accessible (e.g., show a 404 or specific message)
    // For now, redirecting or showing a simple message. A proper 404 would be better.
    // You could use Next.js's notFound() function here if desired.
    return (
        <div className="p-4 md:p-6">
            <h1 className="text-xl font-semibold text-red-600">Academic Year Not Found</h1>
            <p>The specified academic year could not be found, is archived, or does not belong to this school.</p>
            {/* Link back to academic years page or dashboard */}
        </div>
    );
  }

  // Fetch Curriculum Entries
  const curriculumEntries = await prisma.curriculum.findMany({
    where: {
      schoolId: schoolId,
      academicYearId: academicYearId,
    },
    include: {
      grade: { select: { id: true, level: true } },
      subject: { select: { id: true, name: true } },
      books: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [
      { grade: { level: 'asc' } },
      { subject: { name: 'asc' } },
    ],
  });

  // Fetch Grades and Subjects for dropdowns in the form
  const gradesForSchool = await prisma.grade.findMany({
    where: { schoolId: schoolId },
    orderBy: { level: 'asc' },
  });

  const subjectsForSchool = await prisma.subject.findMany({
    where: { schoolId: schoolId },
    orderBy: { name: 'asc' },
  });

  const academicYearsForSchool = await prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, startDate: true, endDate: true, isArchived: true },
  });

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-1">Curriculum Management</h1>
      <h2 className="text-lg text-gray-700 mb-2">For Academic Year: {academicYear.name} ({new Date(academicYear.startDate).toLocaleDateString()} - {new Date(academicYear.endDate).toLocaleDateString()})</h2>
      <p className="mb-4 text-sm">
        <Link
          href={`/schools/${schoolId}/admin/setup/catalog-install?academicYearId=${academicYearId}`}
          className="text-indigo-700 underline"
        >
          Install from catalog
        </Link>{' '}
        <span className="text-gray-500">— seed subjects and rows from a static template (admin).</span>
      </p>
      <CurriculumClient
        schoolId={schoolId}
        academicYearId={academicYearId}
        initialAcademicYear={JSON.parse(JSON.stringify(academicYear))}
        initialCurriculumEntries={JSON.parse(JSON.stringify(curriculumEntries))}
        gradesForSchool={JSON.parse(JSON.stringify(gradesForSchool))}
        subjectsForSchool={JSON.parse(JSON.stringify(subjectsForSchool))}
        initialAcademicYears={JSON.parse(JSON.stringify(academicYearsForSchool))}
      />
    </div>
  );
} 
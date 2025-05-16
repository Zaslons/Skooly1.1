import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken, AuthUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CurriculumClient from './CurriculumClient'; // To be created
import { AcademicYear, Curriculum, Grade, Subject } from '@prisma/client'; // Import Prisma types

// Helper to get current authenticated user
async function getCurrentUserOnPage(): Promise<AuthUser | null> {
  const tokenCookie = cookies().get('auth_token');
  if (!tokenCookie) return null;
  return verifyToken(tokenCookie.value);
}

// Type for Curriculum entries with included Grade and Subject
export type CurriculumWithRelations = Curriculum & {
  grade: Pick<Grade, 'id' | 'level'>;
  subject: Pick<Subject, 'id' | 'name'>;
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
  const currentUser = await getCurrentUserOnPage();
  if (!currentUser) {
    redirect(`/sign-in?callbackUrl=/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);
  }
  if (currentUser.schoolId !== schoolId || currentUser.role !== 'admin') {
    redirect('/(dashboard)'); // Or an unauthorized page
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

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-1">Curriculum Management</h1>
      <h2 className="text-lg text-gray-700 mb-4">For Academic Year: {academicYear.name} ({new Date(academicYear.startDate).toLocaleDateString()} - {new Date(academicYear.endDate).toLocaleDateString()})</h2>
      <CurriculumClient
        schoolId={schoolId}
        academicYearId={academicYearId}
        initialAcademicYear={JSON.parse(JSON.stringify(academicYear))}
        initialCurriculumEntries={JSON.parse(JSON.stringify(curriculumEntries))}
        gradesForSchool={JSON.parse(JSON.stringify(gradesForSchool))}
        subjectsForSchool={JSON.parse(JSON.stringify(subjectsForSchool))}
      />
    </div>
  );
} 
import prisma from '@/lib/prisma';
import AcademicYearsClient from './AcademicYearsClient'; // Reverted to no .tsx extension
import { cookies } from 'next/headers'; // For server-side cookie access
import { verifyToken, AuthUser } from '@/lib/auth'; // Ensure AuthUser is imported
import { redirect } from 'next/navigation'; // For redirecting

// Helper function to get current authenticated user in a Server Component
async function getCurrentUserOnPage(): Promise<AuthUser | null> {
  const tokenCookie = cookies().get('auth_token');
  if (!tokenCookie) {
    return null;
  }
  const user = await verifyToken(tokenCookie.value);
  return user;
}

// Helper function to fetch academic years (similar to API logic)
async function getAcademicYears(schoolId: string, includeArchived: boolean = false) {
  // TODO: Add proper error handling (try-catch)
  const academicYears = await prisma.academicYear.findMany({
    where: {
      schoolId: schoolId,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: {
      startDate: 'desc',
    },
    include: {
      // Potentially include related data if needed directly by the list, e.g., _count of classes
    }
  });
  return academicYears;
}

// Helper function to get the active academic year ID for the school
async function getActiveAcademicYearId(schoolId: string): Promise<string | null> {
    const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { activeAcademicYearId: true }
    });
    return school?.activeAcademicYearId || null;
}

interface AcademicYearsPageProps {
  params: { schoolId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function AcademicYearsPage({ params, searchParams }: AcademicYearsPageProps) {
  const { schoolId } = params;

  // Authentication & Authorization
  const currentUser = await getCurrentUserOnPage();

  if (!currentUser) {
    // Not logged in, redirect to sign-in page
    // Adjust the redirect path as needed
    redirect(`/sign-in?callbackUrl=/schools/${schoolId}/academic-years`); 
  }

  // Check if the user is an admin for this specific school
  if (currentUser.schoolId !== schoolId || currentUser.role !== 'admin') {
    // Logged in, but not authorized for this page/school
    // Redirect to a general dashboard or an unauthorized page
    // Adjust the redirect path as needed
    redirect('/(dashboard)'); // Or a specific unauthorized page
  }
  
  const includeArchived = searchParams.includeArchived === 'true';
  const initialAcademicYears = await getAcademicYears(schoolId, includeArchived);
  const activeSchoolAcademicYearId = await getActiveAcademicYearId(schoolId);

  // We would also fetch any other necessary data for the client component,
  // e.g., dropdown options if forms were directly on this page, but forms will be in modal.

  return (
    <div className="p-4 md:p-6">
      {/* 
        Typically, you'd have a PageHeader component here for title and breadcrumbs.
        Example: <PageHeader title="Academic Years" breadcrumbs={[{ name: "Admin", href: "..." }, { name: "Academic Years" }]} />
      */}
      <h1 className="text-2xl font-semibold mb-4">Manage Academic Years</h1>
      <AcademicYearsClient
        schoolId={schoolId}
        initialAcademicYears={JSON.parse(JSON.stringify(initialAcademicYears))} // Serialize date objects
        activeSchoolAcademicYearId={activeSchoolAcademicYearId}
        // Pass any other required props
      />
    </div>
  );
} 
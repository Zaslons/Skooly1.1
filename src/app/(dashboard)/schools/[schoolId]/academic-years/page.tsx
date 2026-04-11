import prisma from '@/lib/prisma';
import AcademicYearsClient from './AcademicYearsClient'; // Reverted to no .tsx extension
import { getServerUser } from '@/lib/auth';
import { assertSchoolAccessForServerUser } from '@/lib/schoolAccess';
import { redirect } from 'next/navigation'; // For redirecting
import { ensureAcademicYearRolloverForSchool, syncTemporalStatesForSchool } from '@/lib/domain/temporalRules';
import { buildAutomationSummary } from '@/lib/temporalUiSummary';

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
      terms: {
        where: includeArchived ? {} : { isArchived: false },
        select: { id: true, isActive: true, isArchived: true, startDate: true, endDate: true },
      },
    },
  });
  return academicYears;
}

interface AcademicYearsPageProps {
  params: { schoolId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function AcademicYearsPage({ params, searchParams }: AcademicYearsPageProps) {
  const { schoolId } = params;

  // Authentication & Authorization
  const currentUser = await getServerUser();

  if (!currentUser) {
    // Not logged in, redirect to sign-in page
    // Adjust the redirect path as needed
    redirect(`/sign-in?callbackUrl=/schools/${schoolId}/academic-years`); 
  }

  if (currentUser.role !== 'admin' || !(await assertSchoolAccessForServerUser(currentUser, schoolId))) {
    redirect('/(dashboard)');
  }
  
  const includeArchived = searchParams.includeArchived === 'true';
  await ensureAcademicYearRolloverForSchool(schoolId);
  await syncTemporalStatesForSchool(schoolId);
  const initialAcademicYears = await getAcademicYears(schoolId, includeArchived);
  const automationSummary = buildAutomationSummary(initialAcademicYears);

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
        automationSummary={JSON.parse(JSON.stringify(automationSummary))}
        // Pass any other required props
      />
    </div>
  );
} 
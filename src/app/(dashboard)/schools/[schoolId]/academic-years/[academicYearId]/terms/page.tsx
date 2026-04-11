import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import { redirect } from "next/navigation";
import TermsClient from "./TermsClient";
import { ensureAcademicYearRolloverForSchool, syncTemporalStatesForSchool } from "@/lib/domain/temporalRules";
import { buildAutomationSummary } from "@/lib/temporalUiSummary";

async function getAcademicYearWithTerms(schoolId: string, academicYearId: string) {
  return prisma.academicYear.findFirst({
    where: { id: academicYearId, schoolId },
    include: {
      terms: {
        orderBy: [{ startDate: "asc" }],
      },
    },
  });
}

async function getAcademicYearsForSummary(schoolId: string) {
  return prisma.academicYear.findMany({
    where: { schoolId, isArchived: false },
    orderBy: { startDate: "desc" },
    include: {
      terms: {
        where: { isArchived: false },
        select: { id: true, name: true, startDate: true, endDate: true, isArchived: true },
      },
    },
  });
}

interface TermsPageProps {
  params: { schoolId: string; academicYearId: string };
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { schoolId, academicYearId } = params;

  const currentUser = await getServerUser();
  if (!currentUser) {
    redirect(`/sign-in?callbackUrl=/schools/${schoolId}/academic-years/${academicYearId}/terms`);
  }
  if (currentUser.role !== "admin" || !(await assertSchoolAccessForServerUser(currentUser, schoolId))) {
    redirect("/(dashboard)");
  }

  await ensureAcademicYearRolloverForSchool(schoolId);
  await syncTemporalStatesForSchool(schoolId);

  const academicYear = await getAcademicYearWithTerms(schoolId, academicYearId);
  const yearsForSummary = await getAcademicYearsForSummary(schoolId);
  const automationSummary = buildAutomationSummary(yearsForSummary as any);
  if (!academicYear) {
    return <div className="p-6">Academic year not found.</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-2">Manage Terms</h1>
      <p className="text-sm text-gray-600 mb-4">
        Academic Year: <span className="font-medium">{academicYear.name}</span>
      </p>
      <TermsClient
        schoolId={schoolId}
        academicYearId={academicYearId}
        academicYearName={academicYear.name}
        isAcademicYearArchived={academicYear.isArchived}
        initialTerms={JSON.parse(JSON.stringify(academicYear.terms))}
        automationSummary={JSON.parse(JSON.stringify(automationSummary))}
      />
    </div>
  );
}

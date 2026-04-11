import { getVerifiedAuthUser } from '@/lib/actions';
import { assertSchoolAccessForServerUser } from '@/lib/schoolAccess';
import prisma from '@/lib/prisma';
import CatalogInstallClient from './CatalogInstallClient';

export default async function CatalogInstallPage({
  params,
  searchParams,
}: {
  params: { schoolId: string };
  searchParams: { academicYearId?: string };
}) {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div className="p-4 md:p-6">User not authenticated. Please sign in.</div>;
  }
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div className="p-4 md:p-6">Access Denied: You are not authorized for this school.</div>;
  }
  if (authUser.role !== 'admin') {
    return <div className="p-4 md:p-6">Access Denied: This page is for administrators only.</div>;
  }

  const [grades, academicYears, school] = await Promise.all([
    prisma.grade.findMany({ where: { schoolId }, orderBy: { level: 'asc' } }),
    prisma.academicYear.findMany({
      where: { schoolId, isArchived: false },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        catalogTemplateId: true,
        catalogTemplateVersion: true,
        catalogInstalledAt: true,
      },
    }),
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { country: true, teachingSystem: true, name: true },
    }),
  ]);

  if (!school) {
    return <div className="p-4 md:p-6">School not found.</div>;
  }

  const initialAcademicYearId =
    searchParams.academicYearId && academicYears.some((y) => y.id === searchParams.academicYearId)
      ? searchParams.academicYearId
      : academicYears[0]?.id ?? '';

  return (
    <CatalogInstallClient
      schoolId={schoolId}
      schoolName={school.name}
      schoolCountry={school.country}
      schoolTeachingSystem={school.teachingSystem}
      grades={grades}
      academicYears={JSON.parse(JSON.stringify(academicYears))}
      initialAcademicYearId={initialAcademicYearId}
    />
  );
}

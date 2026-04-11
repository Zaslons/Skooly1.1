import { getVerifiedAuthUser } from '@/lib/actions';
import { assertSchoolAccessForServerUser } from '@/lib/schoolAccess';
import prisma from '@/lib/prisma';
import SchoolProfileClient from './SchoolProfileClient';

export default async function SchoolProfilePage({ params }: { params: { schoolId: string } }) {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div className="p-4">Please sign in.</div>;
  }
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div className="p-4">Access denied.</div>;
  }
  if (authUser.role !== 'admin') {
    return <div className="p-4">Administrators only.</div>;
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { country: true, teachingSystem: true, name: true },
  });

  if (!school) {
    return <div className="p-4">School not found.</div>;
  }

  return (
    <SchoolProfileClient
      schoolId={schoolId}
      schoolName={school.name}
      initialCountry={school.country}
      initialTeachingSystem={school.teachingSystem}
    />
  );
}

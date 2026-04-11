import prisma from '@/lib/prisma';
import { getServerUser } from '@/lib/auth';
import { assertSchoolAccessForServerUser } from '@/lib/schoolAccess';
import { redirect } from 'next/navigation';
import PromotionsClient from './PromotionsClient';

export default async function PromotionsPage({ params }: { params: { schoolId: string } }) {
  const { schoolId } = await params;
  const user = await getServerUser();

  if (!user || (user.role !== 'admin' && user.role !== 'system_admin') || !(await assertSchoolAccessForServerUser(user, schoolId))) {
    redirect('/');
  }

  const academicYears = await prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, startDate: true, endDate: true, isArchived: true },
  });

  const grades = await prisma.grade.findMany({
    where: { schoolId },
    orderBy: { level: 'asc' },
    select: { id: true, level: true },
  });

  const classes = await prisma.class.findMany({
    where: { schoolId },
    select: { id: true, name: true, gradeId: true, academicYearId: true },
    orderBy: { name: 'asc' },
  });

  const promotionRules = await prisma.promotionRules.findMany({
    where: { schoolId },
    include: { grade: { select: { level: true } }, academicYear: { select: { name: true } } },
  });

  return (
    <div className="p-6">
      <PromotionsClient
        schoolId={schoolId}
        academicYears={academicYears.map(ay => ({
          ...ay,
          startDate: ay.startDate.toISOString(),
          endDate: ay.endDate.toISOString(),
        }))}
        grades={grades}
        classes={classes}
        existingRules={promotionRules.map(r => ({
          id: r.id,
          academicYearId: r.academicYearId,
          academicYearName: r.academicYear.name,
          gradeId: r.gradeId,
          gradeLevel: r.grade?.level ?? 'All Grades',
          passingThreshold: r.passingThreshold,
          minimumOverallAverage: r.minimumOverallAverage,
          maxFailedSubjects: r.maxFailedSubjects,
          minimumAttendance: r.minimumAttendance,
          borderlineMargin: r.borderlineMargin,
        }))}
      />
    </div>
  );
}

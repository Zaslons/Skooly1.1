import prisma from '@/lib/prisma';
import { getServerUser } from '@/lib/auth';
import { assertSchoolAccessForServerUser } from '@/lib/schoolAccess';
import { redirect } from 'next/navigation';
import JoinCodesClient from './JoinCodesClient';

export default async function JoinCodesPage({ params }: { params: { schoolId: string } }) {
  const { schoolId } = await params;
  const user = await getServerUser();

  if (!user || (user.role !== 'admin' && user.role !== 'system_admin') || !(await assertSchoolAccessForServerUser(user, schoolId))) {
    redirect('/');
  }

  const joinCodes = await prisma.joinCode.findMany({
    where: { schoolId },
    include: {
      class: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const classes = await prisma.class.findMany({
    where: {
      schoolId,
      academicYear: { isArchived: false },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const students = await prisma.student.findMany({
    where: { schoolId },
    select: { id: true, name: true, surname: true },
    orderBy: [{ surname: 'asc' }, { name: 'asc' }],
  });

  return (
    <div className="p-6">
      <JoinCodesClient
        schoolId={schoolId}
        joinCodes={joinCodes.map(jc => ({
          id: jc.id,
          code: jc.code,
          type: jc.type,
          className: jc.class?.name ?? null,
          classId: jc.classId,
          studentId: jc.studentId,
          email: jc.email,
          maxUses: jc.maxUses,
          currentUses: jc.currentUses,
          expiresAt: jc.expiresAt?.toISOString() ?? null,
          isActive: jc.isActive,
          createdAt: jc.createdAt.toISOString(),
        }))}
        classes={classes}
        students={students}
      />
    </div>
  );
}

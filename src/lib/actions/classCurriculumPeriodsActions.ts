'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { getServerUser } from '@/lib/auth';
import { userHasSchoolAccess } from '@/lib/schoolAccess';

const ParamsSchema = z.object({
  schoolId: z.string().cuid(),
  classId: z.coerce.number().int().positive(),
});

/**
 * Returns curriculum rows for the class's grade + academic year with non-null periodsPerWeek (timetable prefill).
 */
export async function getClassCurriculumPeriodsAction(params: z.infer<typeof ParamsSchema>) {
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false as const, message: 'Invalid class or school.' };
  }

  const { schoolId, classId } = parsed.data;

  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== 'admin' || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false as const, message: 'Unauthorized.' };
  }

  const cls = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { gradeId: true, academicYearId: true },
  });

  if (!cls) {
    return { success: false as const, message: 'Class not found.' };
  }

  const rows = await prisma.curriculum.findMany({
    where: {
      schoolId,
      academicYearId: cls.academicYearId,
      gradeId: cls.gradeId,
      periodsPerWeek: { not: null },
    },
    select: { subjectId: true, periodsPerWeek: true },
  });

  return {
    success: true as const,
    periods: rows.map((r) => ({ subjectId: r.subjectId, periodsPerWeek: r.periodsPerWeek as number })),
  };
}

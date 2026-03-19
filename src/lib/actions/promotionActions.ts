'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';
import { getStudentAcademicSummary } from '@/lib/gradeCalculation';

export type PromotionDecision = 'PROMOTED' | 'RETAINED' | 'BORDERLINE';

export interface StudentPromotionSuggestion {
  studentId: string;
  studentName: string;
  classId: number;
  className: string;
  overallAverage: number;
  failedSubjectCount: number;
  attendanceRate: number;
  suggestedDecision: PromotionDecision;
  reason: string;
}

export async function getPromotionRules(schoolId: string, academicYearId: string, gradeId?: number) {
  return prisma.promotionRules.findFirst({
    where: {
      schoolId,
      academicYearId,
      gradeId: gradeId ?? null,
    },
  });
}

export async function savePromotionRulesAction(data: {
  schoolId: string;
  academicYearId: string;
  gradeId?: number;
  passingThreshold: number;
  minimumOverallAverage: number;
  maxFailedSubjects: number;
  minimumAttendance: number;
  borderlineMargin: number;
}) {
  const user = await getServerUser();
  if (!user || user.role !== 'admin' || user.schoolId !== data.schoolId) {
    return { success: false, message: 'Unauthorized.' };
  }

  try {
    await prisma.promotionRules.upsert({
      where: {
        schoolId_academicYearId_gradeId: {
          schoolId: data.schoolId,
          academicYearId: data.academicYearId,
          gradeId: data.gradeId ?? null as any,
        },
      },
      update: {
        passingThreshold: data.passingThreshold,
        minimumOverallAverage: data.minimumOverallAverage,
        maxFailedSubjects: data.maxFailedSubjects,
        minimumAttendance: data.minimumAttendance,
        borderlineMargin: data.borderlineMargin,
      },
      create: {
        schoolId: data.schoolId,
        academicYearId: data.academicYearId,
        gradeId: data.gradeId ?? null,
        passingThreshold: data.passingThreshold,
        minimumOverallAverage: data.minimumOverallAverage,
        maxFailedSubjects: data.maxFailedSubjects,
        minimumAttendance: data.minimumAttendance,
        borderlineMargin: data.borderlineMargin,
      },
    });

    revalidatePath(`/schools/${data.schoolId}/admin/promotions`);
    return { success: true, message: 'Promotion rules saved.' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to save rules.' };
  }
}

export async function generatePromotionSuggestions(
  schoolId: string,
  academicYearId: string
): Promise<{ success: boolean; message?: string; suggestions?: StudentPromotionSuggestion[] }> {
  const user = await getServerUser();
  if (!user || user.role !== 'admin' || user.schoolId !== schoolId) {
    return { success: false, message: 'Unauthorized.' };
  }

  try {
    const classes = await prisma.class.findMany({
      where: { schoolId, academicYearId },
      include: {
        students: { select: { id: true, name: true, surname: true } },
        grade: { select: { id: true, level: true } },
      },
    });

    const suggestions: StudentPromotionSuggestion[] = [];

    for (const cls of classes) {
      const rules = await prisma.promotionRules.findFirst({
        where: {
          schoolId,
          academicYearId,
          OR: [
            { gradeId: cls.gradeId },
            { gradeId: null },
          ],
        },
        orderBy: { gradeId: { sort: 'asc', nulls: 'last' } },
      });

      const threshold = rules?.minimumOverallAverage ?? 50;
      const maxFailed = rules?.maxFailedSubjects ?? 2;
      const minAttendance = rules?.minimumAttendance ?? 75;
      const borderline = rules?.borderlineMargin ?? 5;

      for (const student of cls.students) {
        const summary = await getStudentAcademicSummary(student.id, academicYearId, schoolId);

        if (!summary) {
          suggestions.push({
            studentId: student.id,
            studentName: `${student.name} ${student.surname}`,
            classId: cls.id,
            className: cls.name,
            overallAverage: 0,
            failedSubjectCount: 0,
            attendanceRate: 100,
            suggestedDecision: 'BORDERLINE',
            reason: 'No academic data available.',
          });
          continue;
        }

        let decision: PromotionDecision;
        let reason: string;

        const meetsAverage = summary.overallAverage >= threshold;
        const meetsSubjects = summary.failedSubjectCount <= maxFailed;
        const meetsAttendance = summary.attendanceRate >= minAttendance;
        const isBorderline = summary.overallAverage >= (threshold - borderline) && summary.overallAverage < threshold;

        if (meetsAverage && meetsSubjects && meetsAttendance) {
          decision = 'PROMOTED';
          reason = `Average ${summary.overallAverage.toFixed(1)}% meets threshold. ${summary.failedSubjectCount} failed subject(s).`;
        } else if (isBorderline && meetsSubjects && meetsAttendance) {
          decision = 'BORDERLINE';
          reason = `Average ${summary.overallAverage.toFixed(1)}% is within borderline margin (${(threshold - borderline).toFixed(1)}%-${threshold.toFixed(1)}%). Requires review.`;
        } else {
          decision = 'RETAINED';
          const reasons: string[] = [];
          if (!meetsAverage && !isBorderline) reasons.push(`Average ${summary.overallAverage.toFixed(1)}% below threshold ${threshold}%`);
          if (!meetsSubjects) reasons.push(`${summary.failedSubjectCount} failed subjects (max ${maxFailed})`);
          if (!meetsAttendance) reasons.push(`Attendance ${summary.attendanceRate.toFixed(1)}% below ${minAttendance}%`);
          reason = reasons.join('. ') + '.';
        }

        suggestions.push({
          studentId: student.id,
          studentName: summary.studentName,
          classId: cls.id,
          className: cls.name,
          overallAverage: summary.overallAverage,
          failedSubjectCount: summary.failedSubjectCount,
          attendanceRate: summary.attendanceRate,
          suggestedDecision: decision,
          reason,
        });
      }
    }

    return { success: true, suggestions };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to generate suggestions.' };
  }
}

export async function applyPromotionsAction(data: {
  schoolId: string;
  academicYearId: string;
  targetAcademicYearId: string;
  decisions: { studentId: string; decision: PromotionDecision; targetClassId?: number }[];
}) {
  const user = await getServerUser();
  if (!user || user.role !== 'admin' || user.schoolId !== data.schoolId) {
    return { success: false, message: 'Unauthorized.' };
  }

  try {
    let promotedCount = 0;
    let retainedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of data.decisions) {
        if (item.decision === 'PROMOTED' && item.targetClassId) {
          const targetClass = await tx.class.findUnique({
            where: { id: item.targetClassId },
            select: { id: true, gradeId: true },
          });

          if (!targetClass) continue;

          await tx.studentEnrollmentHistory.updateMany({
            where: {
              studentId: item.studentId,
              academicYearId: data.academicYearId,
              departureDate: null,
            },
            data: {
              departureDate: new Date(),
              status: 'PROMOTED',
            },
          });

          await tx.studentEnrollmentHistory.create({
            data: {
              studentId: item.studentId,
              classId: targetClass.id,
              academicYearId: data.targetAcademicYearId,
              schoolId: data.schoolId,
              enrollmentDate: new Date(),
              status: 'ACTIVE',
            },
          });

          await tx.student.update({
            where: { id: item.studentId },
            data: { classId: targetClass.id, gradeId: targetClass.gradeId },
          });

          promotedCount++;
        } else if (item.decision === 'RETAINED') {
          await tx.studentEnrollmentHistory.updateMany({
            where: {
              studentId: item.studentId,
              academicYearId: data.academicYearId,
              departureDate: null,
            },
            data: {
              departureDate: new Date(),
              status: 'RETAINED',
            },
          });

          const currentEnrollment = await tx.studentEnrollmentHistory.findFirst({
            where: {
              studentId: item.studentId,
              academicYearId: data.academicYearId,
            },
            select: { classId: true },
            orderBy: { enrollmentDate: 'desc' },
          });

          if (currentEnrollment) {
            const retainClass = await tx.class.findFirst({
              where: {
                schoolId: data.schoolId,
                academicYearId: data.targetAcademicYearId,
                gradeId: (await tx.class.findUnique({ where: { id: currentEnrollment.classId }, select: { gradeId: true } }))?.gradeId,
              },
              select: { id: true, gradeId: true },
            });

            if (retainClass) {
              await tx.studentEnrollmentHistory.create({
                data: {
                  studentId: item.studentId,
                  classId: retainClass.id,
                  academicYearId: data.targetAcademicYearId,
                  schoolId: data.schoolId,
                  enrollmentDate: new Date(),
                  status: 'ACTIVE',
                },
              });

              await tx.student.update({
                where: { id: item.studentId },
                data: { classId: retainClass.id, gradeId: retainClass.gradeId },
              });
            }
          }

          retainedCount++;
        }
      }
    });

    revalidatePath(`/schools/${data.schoolId}/admin/promotions`);
    return {
      success: true,
      message: `Promotions applied: ${promotedCount} promoted, ${retainedCount} retained.`,
    };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to apply promotions.' };
  }
}

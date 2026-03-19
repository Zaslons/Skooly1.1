'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';

const EnrollStudentSchema = z.object({
  schoolId: z.string().cuid({ message: 'Valid School ID is required.' }),
  academicYearId: z.string().cuid({ message: 'Valid Academic Year ID is required.' }),
  classId: z.number().int().positive({ message: 'Valid Class ID is required.' }),
  studentId: z.string().cuid({ message: 'Valid Student ID is required.' }),
  enrollmentDate: z.date({ message: 'Enrollment date is required.' }),
});

export interface EnrollStudentData {
  schoolId: string;
  academicYearId: string;
  classId: number;
  studentId: string;
  enrollmentDate: Date;
}

export async function enrollStudentAction(data: EnrollStudentData) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: 'Unauthorized: You do not have permission to enroll students.' };
  }

  const validatedFields = EnrollStudentSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { schoolId, academicYearId, classId, studentId, enrollmentDate } = validatedFields.data;

  try {
    const [ay, cls, student] = await Promise.all([
      prisma.academicYear.findUnique({ where: { id: academicYearId, schoolId, isArchived: false } }),
      prisma.class.findUnique({ where: { id: classId, schoolId, academicYearId } }),
      prisma.student.findUnique({ where: { id: studentId, schoolId } }),
    ]);

    if (!ay) return { success: false, message: 'Academic Year not found, archived, or invalid.' };
    if (!cls) return { success: false, message: 'Class not found or invalid for the academic year.' };
    if (!student) return { success: false, message: 'Student not found or invalid for this school.' };

    if (enrollmentDate < ay.startDate || enrollmentDate > ay.endDate) {
      return { success: false, message: 'Enrollment date must be within the academic year date range.' };
    }

    const activeEnrollmentCount = await prisma.studentEnrollmentHistory.count({
      where: { classId, departureDate: null },
    });
    if (activeEnrollmentCount >= cls.capacity) {
      return { success: false, message: `Class "${cls.name}" is full (${cls.capacity}/${cls.capacity} students).` };
    }

    const existingEnrollment = await prisma.studentEnrollmentHistory.findFirst({
      where: { studentId, academicYearId, departureDate: null },
    });

    if (existingEnrollment) {
      if (existingEnrollment.classId === classId) {
        return { success: false, message: 'Student is already actively enrolled in this class for this academic year.' };
      }
      return { 
        success: false, 
        message: `Student is already actively enrolled in another class (ID: ${existingEnrollment.classId}) for this academic year. Please end the previous enrollment or use the transfer action.` 
      };
    }
    
    const result = await prisma.$transaction(async (tx) => {
      const newEnrollment = await tx.studentEnrollmentHistory.create({
        data: {
          studentId,
          classId,
          academicYearId,
          enrollmentDate,
          departureDate: null,
        },
      });

      await tx.student.update({
        where: { id: studentId },
        data: { classId, gradeId: cls.gradeId },
      });

      return newEnrollment;
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/classes/${classId}/enrollments`);
    revalidatePath(`/schools/${schoolId}/list/students`);

    return { success: true, message: 'Student enrolled successfully!', enrollment: result };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, message: 'This student might already have an enrollment record for this class.' };
    }
    return { success: false, message: error.message || 'Failed to enroll student due to a server error.' };
  }
}

const UnenrollStudentSchema = z.object({
  enrollmentId: z.string().cuid({ message: 'Valid Enrollment ID is required.' }),
  departureDate: z.date({ message: 'Departure date is required.' }),
  schoolId: z.string().cuid(), 
  academicYearId: z.string().cuid(),
  classId: z.number().int().positive(),
});

export interface UnenrollStudentData {
  enrollmentId: string;
  departureDate: Date;
  schoolId: string;
  academicYearId: string;
  classId: number;
}

export async function unenrollStudentAction(data: UnenrollStudentData) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: 'Unauthorized: You do not have permission to unenroll students.' };
  }

  const validatedFields = UnenrollStudentSchema.safeParse(data);
  if (!validatedFields.success) {
    const firstError = Object.values(validatedFields.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: `Validation failed: ${firstError || 'Invalid input.'}` };
  }

  const { enrollmentId, departureDate, schoolId, academicYearId, classId } = validatedFields.data;

  try {
    const enrollmentToUpdate = await prisma.studentEnrollmentHistory.findUnique({
      where: { id: enrollmentId },
      include: { class: { select: { schoolId: true } } },
    });

    if (!enrollmentToUpdate) {
      return { success: false, message: 'Enrollment record not found.' };
    }

    if (enrollmentToUpdate.class.schoolId !== schoolId) {
      return { success: false, message: 'Unauthorized: Enrollment record does not belong to your school.' };
    }

    if (enrollmentToUpdate.enrollmentDate > departureDate) {
      return { success: false, message: 'Departure date cannot be before the enrollment date.' };
    }

    if (enrollmentToUpdate.departureDate !== null) {
      return { success: false, message: 'This student has already been unenrolled.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.studentEnrollmentHistory.update({
        where: { id: enrollmentId },
        data: { departureDate },
      });

      await tx.student.update({
        where: { id: enrollmentToUpdate.studentId },
        data: { classId: null, gradeId: null },
      });
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/classes/${classId}/enrollments`);
    revalidatePath(`/schools/${schoolId}/list/students`);

    return { success: true, message: 'Student unenrolled successfully!' };
  } catch (error: any) {
    if (error.code === 'P2025') {
      return { success: false, message: 'Enrollment record not found for update.' };
    }
    return { success: false, message: error.message || 'Failed to unenroll student due to a server error.' };
  }
}

export interface TransferStudentData {
  schoolId: string;
  academicYearId: string;
  studentId: string;
  fromClassId: number;
  toClassId: number;
  transferDate: Date;
}

export async function transferStudentAction(data: TransferStudentData) {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.schoolId !== data.schoolId || currentUser.role !== 'admin') {
    return { success: false, message: 'Unauthorized.' };
  }

  const { schoolId, academicYearId, studentId, fromClassId, toClassId, transferDate } = data;

  if (fromClassId === toClassId) {
    return { success: false, message: 'Source and destination classes must be different.' };
  }

  try {
    const [fromClass, toClass, student, ay] = await Promise.all([
      prisma.class.findUnique({ where: { id: fromClassId, schoolId, academicYearId } }),
      prisma.class.findUnique({ where: { id: toClassId, schoolId, academicYearId } }),
      prisma.student.findUnique({ where: { id: studentId, schoolId } }),
      prisma.academicYear.findUnique({ where: { id: academicYearId, schoolId, isArchived: false } }),
    ]);

    if (!fromClass) return { success: false, message: 'Source class not found.' };
    if (!toClass) return { success: false, message: 'Destination class not found.' };
    if (!student) return { success: false, message: 'Student not found.' };
    if (!ay) return { success: false, message: 'Academic year not found or archived.' };

    const activeEnrollmentCount = await prisma.studentEnrollmentHistory.count({
      where: { classId: toClassId, departureDate: null },
    });
    if (activeEnrollmentCount >= toClass.capacity) {
      return { success: false, message: `Destination class "${toClass.name}" is full.` };
    }

    const currentEnrollment = await prisma.studentEnrollmentHistory.findFirst({
      where: { studentId, classId: fromClassId, academicYearId, departureDate: null },
    });

    if (!currentEnrollment) {
      return { success: false, message: 'No active enrollment found in the source class.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.studentEnrollmentHistory.update({
        where: { id: currentEnrollment.id },
        data: { departureDate: transferDate },
      });

      await tx.studentEnrollmentHistory.create({
        data: {
          studentId,
          classId: toClassId,
          academicYearId,
          enrollmentDate: transferDate,
        },
      });

      await tx.student.update({
        where: { id: studentId },
        data: { classId: toClassId, gradeId: toClass.gradeId },
      });
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/classes/${fromClassId}/enrollments`);
    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/classes/${toClassId}/enrollments`);
    revalidatePath(`/schools/${schoolId}/list/students`);

    return { success: true, message: 'Student transferred successfully!' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to transfer student.' };
  }
}

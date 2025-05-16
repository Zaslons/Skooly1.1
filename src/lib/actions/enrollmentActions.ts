'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { verifyToken, AuthUser } from '@/lib/auth';

// Helper to get current authenticated user
async function getCurrentUser(): Promise<AuthUser | null> {
  const tokenCookie = cookies().get('auth_token');
  if (!tokenCookie) return null;
  return verifyToken(tokenCookie.value);
}

// Zod schema for enrolling a student
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
  classId: number; // Already number from client
  studentId: string;
  enrollmentDate: Date;
}

export async function enrollStudentAction(data: EnrollStudentData) {
  const currentUser = await getCurrentUser();
  // For enrolling, typically an admin role is required.
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
    // Verify AY, Class, and Student exist and belong to the school
    const [ay, cls, student] = await Promise.all([
      prisma.academicYear.findUnique({ where: { id: academicYearId, schoolId, isArchived: false } }),
      prisma.class.findUnique({ where: { id: classId, schoolId, academicYearId } }),
      prisma.student.findUnique({ where: { id: studentId, schoolId } }),
    ]);

    if (!ay) return { success: false, message: 'Academic Year not found, archived, or invalid.' };
    if (!cls) return { success: false, message: 'Class not found or invalid for the academic year.' };
    if (!student) return { success: false, message: 'Student not found or invalid for this school.' };

    // Check for existing active enrollment for this student in ANY class for THIS academic year
    // A student should generally not be active in two classes in the same AY.
    // If they are moving classes, the old enrollment should be ended (departureDate set).
    const existingEnrollment = await prisma.studentEnrollmentHistory.findFirst({
      where: {
        studentId: studentId,
        academicYearId: academicYearId,
        departureDate: null, // Actively enrolled
      },
    });

    if (existingEnrollment) {
      if (existingEnrollment.classId === classId) {
        return { success: false, message: 'Student is already actively enrolled in this class for this academic year.' };
      }
      return { 
        success: false, 
        message: `Student is already actively enrolled in another class (ID: ${existingEnrollment.classId}) for this academic year. Please end the previous enrollment before starting a new one.` 
      };
    }
    
    const newEnrollment = await prisma.studentEnrollmentHistory.create({
      data: {
        studentId,
        classId,
        academicYearId,
        enrollmentDate,
        departureDate: null,
      },
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/classes/${classId}/enrollments`);

    return {
      success: true,
      message: 'Student enrolled successfully!',
      enrollment: newEnrollment,
    };

  } catch (error: any) {
    console.error("Error enrolling student:", error);
    if (error.code === 'P2002') { // Unique constraint violation (e.g. studentId_classId if active only)
        return { success: false, message: 'This student might already have an enrollment record for this class (possibly inactive).' };
    }
    return { success: false, message: error.message || 'Failed to enroll student due to a server error.' };
  }
}

// Zod schema for unenrolling a student (updating departure date)
const UnenrollStudentSchema = z.object({
  enrollmentId: z.string().cuid({ message: 'Valid Enrollment ID is required.' }),
  departureDate: z.date({ message: 'Departure date is required.' }),
  // For revalidation, we also need schoolId, academicYearId, classId from the client or fetched here
  schoolId: z.string().cuid(), 
  academicYearId: z.string().cuid(),
  classId: z.number().int().positive(),
});

export interface UnenrollStudentData {
  enrollmentId: string;
  departureDate: Date;
  schoolId: string; // Needed for auth and revalidate path
  academicYearId: string; // Needed for revalidate path
  classId: number; // Needed for revalidate path
}

export async function unenrollStudentAction(data: UnenrollStudentData) {
  const currentUser = await getCurrentUser();
  // For unenrolling, typically an admin role is required.
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
      include: {
        class: { select: { schoolId: true } }, // Include class to check its schoolId
      }
    });

    if (!enrollmentToUpdate) {
      return { success: false, message: 'Enrollment record not found.' };
    }

    // Authorization check: Ensure the enrollment record belongs to the correct school
    if (enrollmentToUpdate.class.schoolId !== schoolId) {
      return { success: false, message: 'Unauthorized: Enrollment record does not belong to your school.' };
    }

    if (enrollmentToUpdate.enrollmentDate > departureDate) {
      return { success: false, message: 'Departure date cannot be before the enrollment date.' };
    }

    if (enrollmentToUpdate.departureDate !== null) {
        return { success: false, message: 'This student has already been unenrolled (departure date set).' };
    }

    const updatedEnrollment = await prisma.studentEnrollmentHistory.update({
      where: { id: enrollmentId },
      data: {
        departureDate: departureDate,
      },
    });

    revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/classes/${classId}/enrollments`);

    return {
      success: true,
      message: 'Student unenrolled successfully (departure date set)!',
      enrollment: updatedEnrollment,
    };

  } catch (error: any) {
    console.error("Error unenrolling student:", error);
     if (error.code === 'P2025') { // Record to update not found
        return { success: false, message: 'Enrollment record not found for update.' };
    }
    return { success: false, message: error.message || 'Failed to unenroll student due to a server error.' };
  }
} 
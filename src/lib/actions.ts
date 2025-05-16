"use server";

import { revalidatePath } from "next/cache";
import {
  ClassSchema,
  ExamSchema,
  StudentSchema, // Import StudentSchema type
  studentSchema, // Import studentSchema Zod object
  SubjectSchema,
  TeacherSchema,
  LessonSchema,
  AssignmentSchema,
  ParentSchema, // Import ParentSchema type
  parentSchema, // Import parentSchema Zod object
  ResultSchema,
  AnnouncementSchema,
  EventSchema,
  AttendanceSchema,
  GradeSchema,
  teacherSchema, // Import teacherSchema Zod object
  resultSchema, // Import resultSchema Zod object
  adminSchema, // Import adminSchema
  TeacherAvailabilitySchema, // Added
  teacherAvailabilitySchema, // Added
  scheduleChangeRequestSchema, // Added for Phase 2
  ScheduleChangeRequestSchema,  // Added for Phase 2
  roomSchema, // Adjusted import path if necessary
  RoomSchema // Adjusted import path if necessary
} from "./formValidationSchemas";
import prisma from "./prisma";
import { z, type ZodIssue } from "zod";
import { Prisma, PrismaClient } from '@prisma/client';
import { cookies } from 'next/headers';
import { verifyToken, hashPassword, generateToken } from './auth'; // Added generateToken
import type { AuthUser } from './auth';
import { getActiveSchoolSubscription } from './subscriptionUtils'; // NEW: Import for subscription checks
import { 
  convertToDateTime, // Added
  formatDateTimeToTimeString // Added
} from "./utils"; 
import { Day, ScheduleChangeType as PrismaScheduleChangeType, RequestStatus as PrismaRequestStatus } from "@prisma/client"; // Added ScheduleChangeType

type CurrentState = { success: boolean; error: boolean };

export const createSubject = async (
  currentState: ActionState,
  data: SubjectSchema
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Optional: Validate teachers belong to the same school
    if (data.teachers && data.teachers.length > 0) {
        const teacherIds = data.teachers;
        const teachersInSchool = await prisma.teacher.count({
            where: { id: { in: teacherIds }, schoolId: schoolId }
        });
        if (teachersInSchool !== teacherIds.length) {
            return { success: false, error: true, message: "One or more selected teachers do not belong to this school." };
        }
    }

    await prisma.subject.create({
      data: {
        name: data.name,
        schoolId: schoolId,
        teachers: {
          connect: data.teachers?.map((teacherId) => ({ id: teacherId })) ?? [],
        },
      },
    });

    revalidatePath(`/schools/${schoolId}/subjects`);
    return { success: true, error: false, message: "Subject created." };
  } catch (err: any) {
    console.error("Error creating subject:", err);
    let errMsg = err instanceof Error ? err.message : "Failed to create subject.";
    if (err.code === 'P2002') {
        errMsg = "A subject with this name already exists in this school.";
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const updateSubject = async (
  currentState: ActionState,
  data: SubjectSchema
): Promise<ActionState> => {
  if (!data.id) {
    return { success: false, error: true, message: "Subject ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify subject exists in the school
    const subjectExists = await prisma.subject.findUnique({ where: { id: data.id, schoolId: schoolId }, select: { id: true } });
    if (!subjectExists) return { success: false, error: true, message: "Subject not found in this school." };

     // Optional: Validate teachers belong to the same school
    if (data.teachers && data.teachers.length > 0) {
        const teacherIds = data.teachers;
        const teachersInSchool = await prisma.teacher.count({
            where: { id: { in: teacherIds }, schoolId: schoolId }
        });
        if (teachersInSchool !== teacherIds.length) {
            return { success: false, error: true, message: "One or more selected teachers do not belong to this school." };
        }
    }

    await prisma.subject.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
        name: data.name,
        teachers: {
          set: data.teachers?.map((teacherId) => ({ id: teacherId })) ?? [],
        },
      },
    });

    revalidatePath(`/schools/${schoolId}/subjects`);
    return { success: true, error: false, message: "Subject updated." };
  } catch (err: any) {
    console.error("Error updating subject:", err);
     let errMsg = err instanceof Error ? err.message : "Failed to update subject.";
    if (err.code === 'P2002') {
        errMsg = "A subject with this name already exists in this school.";
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const deleteSubject = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
  if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Subject ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

     // Verify subject exists in the school
    const subjectExists = await prisma.subject.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
    if (!subjectExists) return { success: false, error: true, message: "Subject not found in this school." };

    // Dependencies: Lessons linked. Cascade should handle.
    await prisma.subject.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/subjects`);
    return { success: true, error: false, message: "Subject deleted." };
  } catch (err: any) {
    console.error("Error deleting subject:", err);
     if ((err as any)?.code === 'P2014' || (err as any)?.code === 'P2003') {
         return { success: false, error: true, message: "Cannot delete subject. It might still be assigned to lessons." };
    }
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete subject." };
  }
};

export const createClass = async (
  currentState: ActionState,
  data: ClassSchema // Assumes ClassSchema now includes optional academicYearId
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();
    let targetAcademicYearId: string;

    if (data.academicYearId) {
      // Validate this academicYearId belongs to the school and is not archived
      const ayExists = await prisma.academicYear.findUnique({
        where: { id: data.academicYearId, schoolId: schoolId, isArchived: false }
      });
      if (!ayExists) {
        return { success: false, error: true, message: "Specified academic year not found, is archived, or does not belong to this school." };
      }
      targetAcademicYearId = data.academicYearId;
      console.log(`[createClass] Using provided academicYearId: ${targetAcademicYearId}`);
    } else {
      console.log("[createClass] No academicYearId provided, fetching school's active academic year.");
      const schoolWithActiveYear = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { activeAcademicYearId: true }
      });
      if (!schoolWithActiveYear || !schoolWithActiveYear.activeAcademicYearId) {
        return { success: false, error: true, message: "School does not have an active academic year set, and none was specified for the class." };
      }
      targetAcademicYearId = schoolWithActiveYear.activeAcademicYearId;
      console.log(`[createClass] Using school's active academicYearId: ${targetAcademicYearId}`);
    }

    // Validate Grade and Supervisor Teacher belong to the same school
    if (data.gradeId) {
        const grade = await prisma.grade.findUnique({ where: { id: data.gradeId, schoolId: schoolId }, select: { id: true } });
        if (!grade) return { success: false, error: true, message: "Selected grade not found in this school." };
    }
    if (data.supervisorId) {
        const teacher = await prisma.teacher.findUnique({ where: { id: data.supervisorId, schoolId: schoolId }, select: { id: true } });
        if (!teacher) return { success: false, error: true, message: "Selected supervisor not found in this school." };
    }

    await prisma.class.create({
      data: {
          name: data.name,
          capacity: data.capacity,
          gradeId: data.gradeId,
          supervisorId: data.supervisorId,
          schoolId: schoolId, 
          academicYearId: targetAcademicYearId, // Use the determined academicYearId
      }
    });

    revalidatePath(`/schools/${schoolId}/classes`);
    // Also revalidate the specific academic year's classes page if targetAcademicYearId is known
    revalidatePath(`/schools/${schoolId}/academic-years/${targetAcademicYearId}/classes`);
    return { success: true, error: false, message: "Class created." };
  } catch (err: any) {
    console.error("Error creating class:", err);
    let errMsg = err instanceof Error ? err.message : "Failed to create class.";
    if (err.code === 'P2002') {
        // P2002 on Class model is likely on unique([name, schoolId, academicYearId])
        errMsg = "A class with this name already exists in this school for the specified academic year.";
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const updateClass = async (
  currentState: ActionState,
  data: ClassSchema
): Promise<ActionState> => {
   if (!data.id) {
    return { success: false, error: true, message: "Class ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate Grade and Supervisor Teacher belong to the same school
    if (data.gradeId) {
        const grade = await prisma.grade.findUnique({ where: { id: data.gradeId, schoolId: schoolId }, select: { id: true } });
        if (!grade) return { success: false, error: true, message: "Selected grade not found in this school." };
    }
    if (data.supervisorId) {
        const teacher = await prisma.teacher.findUnique({ where: { id: data.supervisorId, schoolId: schoolId }, select: { id: true } });
        if (!teacher) return { success: false, error: true, message: "Selected supervisor not found in this school." };
    }

    // Verify class belongs to school
     const classExists = await prisma.class.findUnique({ where: { id: data.id, schoolId: schoolId }, select: { id: true } });
     if (!classExists) return { success: false, error: true, message: "Class not found in this school." };

    await prisma.class.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
         name: data.name,
         capacity: data.capacity,
         gradeId: data.gradeId,
         supervisorId: data.supervisorId,
      }
    });

    revalidatePath(`/schools/${schoolId}/classes`);
    return { success: true, error: false, message: "Class updated." };
  } catch (err: any) {
    console.error("Error updating class:", err);
    let errMsg = err instanceof Error ? err.message : "Failed to update class.";
    if (err.code === 'P2002') {
        errMsg = "A class with this name already exists in this school.";
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const deleteClass = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
   if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Class ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

     // Verify class belongs to school
     const classExists = await prisma.class.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
     if (!classExists) return { success: false, error: true, message: "Class not found in this school." };

    // Dependencies: Students, Lessons, Events, Announcements linked. Cascade should handle.
    await prisma.class.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/classes`);
    return { success: true, error: false, message: "Class deleted." };
  } catch (err: any) {
    console.error("Error deleting class:", err);
     if ((err as any)?.code === 'P2014' || (err as any)?.code === 'P2003') {
         return { success: false, error: true, message: "Cannot delete class. It might still have related students, lessons, events, or announcements." };
    }
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete class." };
  }
};

export const createTeacher = async (
  currentState: ActionState,
  data: TeacherSchema // Assume TeacherSchema now includes email and password fields
): Promise<ActionState> => {
  let createdAuthId: string | undefined;
  try {
    const schoolId = await getCurrentUserSchoolId();

    // NEW: Subscription Check
    const activeSubscriptionDetails = await getActiveSchoolSubscription(schoolId);
    if (!activeSubscriptionDetails) {
      return {
        success: false,
        error: true,
        message: "No active subscription found for the school. Please subscribe to a plan to add teachers."
      };
    }

    const { plan } = activeSubscriptionDetails;
    if (plan.maxTeachers !== null) {
      const currentTeacherCount = await prisma.teacher.count({ where: { schoolId: schoolId } });
      if (currentTeacherCount >= plan.maxTeachers) {
        return {
          success: false,
          error: true,
          message: `Cannot add new teacher. Your current plan allows a maximum of ${plan.maxTeachers} teachers. You currently have ${currentTeacherCount} teachers.`
        };
      }
    }
    // END NEW: Subscription Check

    // Validate subjects belong to the same school (existing logic is fine)
    if (data.subjects && data.subjects.length > 0) {
        const subjectIds = data.subjects.map(s => parseInt(s)).filter(id => !isNaN(id));
        const subjectsInSchool = await prisma.subject.count({
            where: { id: { in: subjectIds }, schoolId: schoolId }
        });
        if (subjectsInSchool !== subjectIds.length) {
            return { success: false, error: true, message: "One or more selected subjects do not belong to this school." };
        }
    }

    // 1. Create Auth record for the new teacher
    if (!data.email || !data.password) {
      return { success: false, error: true, message: "Email and password are required for teacher creation." };
    }
    const hashedPassword = await hashPassword(data.password);

    await prisma.$transaction(async (tx) => {
      const newAuthRecord = await tx.auth.create({
        data: {
          username: data.username, // Ensure username is provided for Auth record
          email: data.email && data.email.trim() !== "" ? data.email : undefined, // Email is optional for Auth
          password: hashedPassword,
          role: "teacher",
          schoolId: schoolId,
        },
      });
      createdAuthId = newAuthRecord.id;

      // 2. Create Prisma Teacher record, linking to the Auth record
      await tx.teacher.create({
      data: {
          // Teacher.id will be auto-generated by Prisma (CUID)
          username: data.username, // Username might be redundant if email is primary identifier
        name: data.name,
        surname: data.surname,
          email: data.email && data.email.trim() !== "" ? data.email : null, // Store null for empty email in Teacher
        phone: data.phone || null,
        address: data.address,
        img: data.img || null,
        bloodType: data.bloodType,
        sex: data.sex,
        birthday: data.birthday,
          schoolId: schoolId,
          authId: createdAuthId, // Link to the Auth table
        subjects: {
          connect: data.subjects?.map((subjectId: string) => ({
            id: parseInt(subjectId),
          })) ?? [],
        },
      },
      });
    });

    revalidatePath(`/schools/${schoolId}/list/teachers`); // Corrected path
    return { success: true, error: false, message: "Teacher created successfully." };

  } catch (err: any) {
    console.error("Error creating teacher:", err);
    let errMsg = "Failed to create teacher.";

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
     if (err.code === 'P2002') {
        const target = err.meta?.target as string[] | undefined;
        if (target && target.includes('email') && target.includes('Auth_email_key')) {
          errMsg = "This email is already registered in the authentication system.";
        } else if (target && (target.includes('username') || target.includes('Teacher_username_key'))) {
            errMsg = "This username is already taken by another teacher.";
        } else if (target && target.includes('email') && target.includes('Teacher_email_key')) {
            errMsg = "This email is already taken by another teacher profile.";
        }else {
          errMsg = "A teacher with similar identifying information (e.g., email or username) already exists.";
        }
      }
    }
     else if (err instanceof Error) {
          errMsg = err.message;
    }

    // No explicit cleanup for Auth record here, transaction should roll back.
    // If no transaction, manual cleanup would be: 
    // if (createdAuthId) { await prisma.auth.delete({ where: { id: createdAuthId } }).catch(e => console.error("Auth cleanup failed", e)); }

    return { success: false, error: true, message: errMsg };
  }
};

export const updateTeacher = async (
  currentState: ActionState,
  data: TeacherSchema
): Promise<ActionState> => {
  if (!data.id) {
    return { success: false, error: true, message: "Teacher ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    const teacherToUpdate = await prisma.teacher.findUnique({
      where: { id: data.id, schoolId: schoolId },
      select: { authId: true }
    });

    if (!teacherToUpdate || !teacherToUpdate.authId) {
      return { success: false, error: true, message: "Teacher not found or has no associated auth record." };
    }

    // Validate subjects belong to the same school (existing logic is fine)
    if (data.subjects && data.subjects.length > 0) {
        const subjectIds = data.subjects.map(s => parseInt(s)).filter(id => !isNaN(id));
        const subjectsInSchool = await prisma.subject.count({
            where: { id: { in: subjectIds }, schoolId: schoolId }
        });
        if (subjectsInSchool !== subjectIds.length) {
            return { success: false, error: true, message: "One or more selected subjects do not belong to this school." };
        }
    }

    // 1. Update Auth record (e.g., password if provided)
    if (data.password && data.password !== "") {
      const hashedPassword = await hashPassword(data.password);
      await prisma.auth.update({
        where: { id: teacherToUpdate.authId },
        data: { password: hashedPassword },
        });
    }
    // Note: Email updates in Auth table would require careful handling for uniqueness and verification.
    // Username is not in Auth table based on current schema.

    // 2. Update Prisma Teacher record
    await prisma.teacher.update({
      where: {
        id: data.id, // Teacher.id
        schoolId: schoolId,
      },
      data: {
        username: data.username, // This is Teacher.username
        name: data.name,
        surname: data.surname,
        email: data.email && data.email.trim() !== "" ? data.email : null, // This is Teacher.email
        phone: data.phone || null,
        address: data.address,
        img: data.img || null,
        bloodType: data.bloodType,
        sex: data.sex,
        birthday: data.birthday,
        subjects: {
          set: data.subjects?.map((subjectId: string) => ({
            id: parseInt(subjectId),
          })) ?? [],
        },
      },
    });

    revalidatePath(`/schools/${schoolId}/list/teachers`); // Corrected path
    return { success: true, error: false, message: "Teacher updated." };
  } catch (err: any) {
    console.error("Error updating teacher:", err);
    let errMsg = "Failed to update teacher.";
     if (err.code === 'P2002') {
        const target = err.meta?.target as string[] | undefined;
        if (target && (target.includes('username') || target.includes('Teacher_username_key'))) {
            errMsg = "This username is already taken by another teacher.";
        } else if (target && target.includes('email') && target.includes('Teacher_email_key')) {
            errMsg = "This email is already taken by another teacher profile.";
        } else if (target && target.includes('email') && target.includes('Auth_email_key')) {
            errMsg = "This email is already registered in the authentication system (if Auth email was updated).";
        } else {
          errMsg = "A teacher with similar identifying information already exists.";
        }
     }
    return { success: false, error: true, message: errMsg };
  }
};

export const deleteTeacher = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const id = formData.get("id") as string; // Teacher.id
  if (!id) {
      return { success: false, error: true, message: "Teacher ID missing." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    const teacherToDelete = await prisma.teacher.findUnique({
      where: { id: id, schoolId: schoolId },
      select: { authId: true }
    });

    if (!teacherToDelete) {
      return { success: false, error: true, message: "Teacher not found in this school." };
    }

    await prisma.$transaction(async (tx) => {
    // 1. Delete Prisma Teacher record first
      await tx.teacher.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

      // 2. Delete associated Auth record if authId exists
      if (teacherToDelete.authId) {
        await tx.auth.delete({
          where: { id: teacherToDelete.authId },
        });
    }
    });

    revalidatePath(`/schools/${schoolId}/list/teachers`); // Corrected path
    return { success: true, error: false, message: "Teacher deleted." };
  } catch (err: any) {
    console.error("Error deleting teacher:", err);
    if ((err as any)?.code === 'P2014' || (err as any)?.code === 'P2003') {
         return { success: false, error: true, message: "Cannot delete teacher. They might still be assigned to classes or lessons." };
    }
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete teacher." };
  }
};

export const createStudent = async (
  currentState: ActionState,
  data: StudentSchema 
): Promise<ActionState> => {
  // Make email optional for student creation, but username is key for Auth
  if (!data.username || !data.password || data.password.length < 8) {
    return { success: false, error: true, message: "Username and Password (min 8 chars) are required for new students." };
  }
  // Email can be optional if studentSchema allows it.

  let createdAuthId: string | undefined;
  try {
    const schoolId = await getCurrentUserSchoolId();

    // NEW: Enhanced Subscription Check
    const activeSubscriptionDetails = await getActiveSchoolSubscription(schoolId);
    if (!activeSubscriptionDetails) {
      return {
        success: false,
        error: true,
        message: "No active subscription found for the school. Please subscribe to a plan to add students."
      };
    }
    const { plan } = activeSubscriptionDetails;
    // END NEW: Enhanced Subscription Check

    // Validate Class, Grade, Parent belong to the same school
    const classItem = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, include: { _count: { select: { students: true } } } });
    if (!classItem) return { success: false, error: true, message: "Selected class not found in this school." };

    // Existing class capacity check (good)
    if (classItem.capacity <= classItem._count.students) {
      return { success: false, error: true, message: `Class ${classItem.name} is full (Capacity: ${classItem.capacity}).` };
    }

    // NEW: maxStudents check against the plan
    if (plan.maxStudents !== null) {
      const currentStudentCount = await prisma.student.count({ where: { schoolId: schoolId } });
      if (currentStudentCount >= plan.maxStudents) {
        return {
          success: false,
          error: true,
          message: `Cannot add new student. Your current plan allows a maximum of ${plan.maxStudents} students. You currently have ${currentStudentCount} students.`
        };
      }
    }
    // END NEW: maxStudents check

    const gradeExists = await prisma.grade.findUnique({ where: { id: data.gradeId, schoolId: schoolId }, select: { id: true } });
    if (!gradeExists) return { success: false, error: true, message: "Selected grade not found in this school." };

    if (!data.parentId) {
         return { success: false, error: true, message: "Parent ID is missing." };
    }
    const parentExists = await prisma.parent.findUnique({ where: { id: data.parentId, schoolId: schoolId }, select: { id: true } });
    if (!parentExists) return { success: false, error: true, message: "Selected parent not found in this school." };

    const hashedPassword = await hashPassword(data.password);

    await prisma.$transaction(async (tx) => {
      // 1. Create Auth record
      const newAuthRecord = await tx.auth.create({
        data: {
          username: data.username, // Ensure username is provided for Auth record
          email: data.email && data.email.trim() !== "" ? data.email : undefined, // Email is optional for Auth
          password: hashedPassword,
          role: "student",
          schoolId: schoolId,
        },
      });
      createdAuthId = newAuthRecord.id;

      // 2. Create Prisma Student record, linking to Auth
      await tx.student.create({
      data: {
          // Student.id will be auto-generated (CUID)
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email && data.email.trim() !== "" ? data.email : null, // Handle empty string for Student email
        phone: data.phone || null,
        address: data.address,
          img: data.img || null,
        bloodType: data.bloodType,
        sex: data.sex,
        birthday: data.birthday,
        gradeId: data.gradeId,
        classId: data.classId,
          parentId: data.parentId,
        schoolId: schoolId,
          authId: createdAuthId, // Link to the Auth table
      },
      });
    });

    revalidatePath(`/schools/${schoolId}/list/students`);
    revalidatePath(`/schools/${schoolId}/list/classes/${data.classId}`); // Corrected path
    return { success: true, error: false, message: "Student created." };
  } catch (err: any) {
    console.error("Error creating student:", err);
    // Transaction should handle rollback, so no manual Auth cleanup needed here normally.
    let errMsg = "Failed to create student.";
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.target as string[] | undefined;
        if (target && target.includes('email') && target.includes('Auth_email_key')) {
          errMsg = "This email is already registered.";
        } else if (target && (target.includes('username') || target.includes('Student_username_key'))) {
            errMsg = "This username is already taken.";
        } else if (target && target.includes('email') && target.includes('Student_email_key')) {
            errMsg = "This email is already used by another student profile.";
        } else {
          errMsg = "A student with similar identifying information already exists.";
        }
    } else if (err instanceof Error) {
         errMsg = err.message;
     }
    return { success: false, error: true, message: errMsg };
  }
};

export const updateStudent = async (
  currentState: ActionState,
  data: StudentSchema
): Promise<ActionState> => {
  if (!data?.id) { // data.id is Student.id
    return { success: false, error: true, message: "Student ID missing." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    const studentToUpdate = await prisma.student.findUnique({
      where: { id: data.id, schoolId: schoolId },
      select: { authId: true, classId: true }
    });

    if (!studentToUpdate || !studentToUpdate.authId) {
      return { success: false, error: true, message: "Student not found or has no associated auth record." };
    }

    // Validate Class, Grade, Parent belong to the same school
    const classItem = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, select: { id: true } });
    if (!classItem) return { success: false, error: true, message: "Selected class not found in this school." };

    const gradeExists = await prisma.grade.findUnique({ where: { id: data.gradeId, schoolId: schoolId }, select: { id: true } });
    if (!gradeExists) return { success: false, error: true, message: "Selected grade not found in this school." };

    if (!data.parentId) {
         return { success: false, error: true, message: "Parent ID is missing." };
    }
    const parentExists = await prisma.parent.findUnique({ where: { id: data.parentId, schoolId: schoolId }, select: { id: true } });
    if (!parentExists) return { success: false, error: true, message: "Selected parent not found in this school." };

    // 1. Update Auth record (password if provided)
    if (data.password && data.password !== "") {
      const hashedPassword = await hashPassword(data.password);
      await prisma.auth.update({
        where: { id: studentToUpdate.authId },
        data: { password: hashedPassword },
      });
    }

    // 2. Update Prisma Student record
    await prisma.student.update({
      where: {
        id: data.id, // Student.id
        schoolId: schoolId,
      },
      data: {
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email && data.email.trim() !== "" ? data.email : null, // Handle empty string for Student email
        phone: data.phone || null,
        address: data.address,
        img: data.img || null,
        bloodType: data.bloodType,
        sex: data.sex,
        birthday: data.birthday,
        gradeId: data.gradeId,
        classId: data.classId,
        parentId: data.parentId,
      },
    });

    revalidatePath(`/schools/${schoolId}/list/students`);
    if (studentToUpdate.classId !== data.classId) {
        revalidatePath(`/schools/${schoolId}/list/classes/${studentToUpdate.classId}`); // Revalidate old class
        revalidatePath(`/schools/${schoolId}/list/classes/${data.classId}`);   // Revalidate new class
    } else {
        revalidatePath(`/schools/${schoolId}/list/classes/${data.classId}`);
    }
    return { success: true, error: false, message: "Student updated." };
  } catch (err: any) {
    console.error("Error updating student:", err);
    let errMsg = "Failed to update student.";
     if (err.code === 'P2002') {
        // Handle P2002 for Student username/email or Auth email if it were updatable here
        errMsg = "A student with this username or email might already exist.";
     }
    return { success: false, error: true, message: errMsg };
  }
};

export const deleteStudent = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const id = formData.get("id") as string; // Student.id
   if (!id) {
      return { success: false, error: true, message: "Student ID missing." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    const studentToDelete = await prisma.student.findUnique({ 
         where: { id: id, schoolId: schoolId }, 
        select: { authId: true, classId: true } 
        });

    if (!studentToDelete) {
        return { success: false, error: true, message: "Student not found in this school." };
    }

    await prisma.$transaction(async (tx) => {
    // 1. Delete Prisma Student
      await tx.student.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

      // 2. Delete associated Auth record if authId exists
      if (studentToDelete.authId) {
        await tx.auth.delete({
          where: { id: studentToDelete.authId },
        });
    }
    });

    revalidatePath(`/schools/${schoolId}/list/students`);
    if (studentToDelete.classId) {
        revalidatePath(`/schools/${schoolId}/list/classes/${studentToDelete.classId}`);
    }
    return { success: true, error: false, message: "Student deleted." };
  } catch (err: any) {
    console.error("Error deleting student:", err);
    if ((err as any)?.code === 'P2014' || (err as any)?.code === 'P2003') {
         return { success: false, error: true, message: "Cannot delete student. They might still have related results or attendance records." };
    }
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete student." };
  }
};

export const createExam = async (
  currentState: CurrentState,
  data: ExamSchema
): Promise<CurrentState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate that the referenced Lesson belongs to the same school
    const lesson = await prisma.lesson.findUnique({
        where: { id: data.lessonId, schoolId: schoolId },
        select: { id: true }
    });
    if (!lesson) {
        return { success: false, error: true };
    }

    await prisma.exam.create({
      data: {
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        lessonId: data.lessonId,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/exams`);
    return { success: true, error: false };
  } catch (err) {
    console.error("Error creating exam:", err);
    return { success: false, error: true };
  }
};

export const updateExam = async (
  currentState: CurrentState,
  data: ExamSchema
): Promise<CurrentState> => {
  if (!data.id) {
    return { success: false, error: true };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate Lesson belongs to the school
    const lesson = await prisma.lesson.findUnique({
        where: { id: data.lessonId, schoolId: schoolId }, select: { id: true }
    });
    if (!lesson) {
        return { success: false, error: true };
    }

    // Verify Exam belongs to the school before update
    const examExists = await prisma.exam.findUnique({
        where: { id: data.id, schoolId: schoolId }, select: { id: true }
    });
    if (!examExists) {
        return { success: false, error: true };
    }

    await prisma.exam.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        lessonId: data.lessonId,
      },
    });

    revalidatePath(`/schools/${schoolId}/exams`);
    return { success: true, error: false };
  } catch (err) {
    console.error("Error updating exam:", err);
    return { success: false, error: true };
  }
};

export const deleteExam = async (
  currentState: CurrentState,
  data: FormData
): Promise<CurrentState> => {
  const idString = data.get("id") as string;
  const id = parseInt(idString);
  if (isNaN(id)) {
     return { success: false, error: true };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify Exam belongs to the school before delete
     const examExists = await prisma.exam.findUnique({
        where: { id: id, schoolId: schoolId }, select: { id: true }
    });
    if (!examExists) {
        return { success: false, error: true };
    }

    // Dependencies: Results are linked. Cascade delete should handle this.
    await prisma.exam.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/exams`);
    return { success: true, error: false };
  } catch (err) {
    console.error("Error deleting exam:", err);
    // Handle potential FK constraint errors if cascade isn't set up correctly
    return { success: false, error: true };
  }
};

// Lesson actions
export const createLesson = async (
  currentState: ActionState,
  data: LessonSchema
): Promise<ActionState> => {
  try {
    const authUser = await getVerifiedAuthUser(); // Get authenticated user
    if (!authUser || !authUser.schoolId) {
      return { success: false, error: true, message: "User not authenticated or not associated with a school." };
    }
    const schoolId = authUser.schoolId; // Use schoolId from authenticated user

    // Validate related entities belong to the same school
    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId, schoolId: schoolId }, select: { id: true } });
    if (!subject) return { success: false, error: true, message: "Selected subject not found in this school." };
    const classExists = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, select: { id: true } });
    if (!classExists) return { success: false, error: true, message: "Selected class not found in this school." };
    const teacher = await prisma.teacher.findUnique({ where: { id: data.teacherId, schoolId: schoolId }, select: { id: true } });
    if (!teacher) return { success: false, error: true, message: "Selected teacher not found in this school." };

    // --- NEW: Validate Room if roomId is provided ---
    if (data.roomId) {
      const room = await prisma.room.findUnique({ where: { id: data.roomId, schoolId: schoolId }, select: { id: true } });
      if (!room) return { success: false, error: true, message: "Selected room not found in this school." };
    }
    // --- END NEW ---

    // MODIFIED Teacher Availability Check Logic (Default Available 8 AM - 5 PM Weekdays)
    const lessonStartTime = new Date(data.startTime); 
    const lessonEndTime = new Date(data.endTime);   

    if (lessonEndTime <= lessonStartTime) {
        return { success: false, error: true, message: "Lesson end time must be after start time." };
    }

    // Define default working hours (example: 8 AM to 5 PM)
    const DEFAULT_WORK_START_HOUR = 8;
    const DEFAULT_WORK_END_HOUR = 17;
    const lessonDay = data.day; // This is PrismaDay enum: MONDAY, TUESDAY, etc.

    // Check if lesson is on a weekend (assuming default unavailable)
    if (lessonDay === Day.SATURDAY || lessonDay === Day.SUNDAY) {
        const dayString: string = lessonDay; // Explicitly type as string
        return {
            success: false,
            error: true,
            message: `Lessons cannot be scheduled on ${dayString.toLowerCase()}s (outside default working days).`
        };
    }

    // Check if lesson time is within default working hours for weekdays
    const lessonStartHour = lessonStartTime.getHours();
    const lessonEndHour = lessonEndTime.getHours();
    const lessonEndMinutes = lessonEndTime.getMinutes();
    
    // Lesson must start on or after default start and end at or before default end.
    // A lesson ending at 17:00 is fine. A lesson ending at 17:01 is not.
    const isWithinDefaultHours = 
        lessonStartHour >= DEFAULT_WORK_START_HOUR &&
        (lessonEndHour < DEFAULT_WORK_END_HOUR || (lessonEndHour === DEFAULT_WORK_END_HOUR && lessonEndMinutes === 0));

    if (!isWithinDefaultHours) {
        return {
            success: false,
            error: true,
            message: `Lesson time is outside default working hours (${DEFAULT_WORK_START_HOUR}:00 - ${DEFAULT_WORK_END_HOUR}:00 for weekdays).`
        };
    }

    // Fetch only UNAVAILABLE slots for conflict checking
    const unavailableSlots = await prisma.teacherAvailability.findMany({
        where: {
            teacherId: data.teacherId,
            schoolId: schoolId,
            dayOfWeek: lessonDay, // lessonDay is data.day, e.g., "MONDAY"
            isAvailable: false, 
        }
    });

    const lessonStartActual = new Date(data.startTime); 
    const lessonEndActual = new Date(data.endTime);     

    // Check for conflicts with any "UNAVAILABLE" slots.
    const conflictingUnavailableSlot = unavailableSlots.find(slot => {
        const dbSlotStart = new Date(slot.startTime); 
        const dbSlotEnd = new Date(slot.endTime);     

        // Create effective slot times on the same date as the lesson for comparison
        const effectiveSlotStart = new Date(lessonStartActual);
        effectiveSlotStart.setHours(dbSlotStart.getHours(), dbSlotStart.getMinutes(), dbSlotStart.getSeconds(), dbSlotStart.getMilliseconds());
        effectiveSlotStart.setFullYear(lessonStartActual.getFullYear(), lessonStartActual.getMonth(), lessonStartActual.getDate());


        const effectiveSlotEnd = new Date(lessonStartActual); 
        effectiveSlotEnd.setHours(dbSlotEnd.getHours(), dbSlotEnd.getMinutes(), dbSlotEnd.getSeconds(), dbSlotEnd.getMilliseconds());
        effectiveSlotEnd.setFullYear(lessonStartActual.getFullYear(), lessonStartActual.getMonth(), lessonStartActual.getDate());
        
        // Overlap condition
        return lessonStartActual < effectiveSlotEnd && lessonEndActual > effectiveSlotStart;
    });

    if (conflictingUnavailableSlot) {
        return {
            success: false,
            error: true,
            message: "Lesson time conflicts with a period the teacher has marked as UNAVAILABLE."
        };
    }
    // END: MODIFIED Teacher Availability Check

    // Existing Teacher Lesson Conflict Check (different from availability)
    const overlappingLesson = await prisma.lesson.findFirst({
      where: {
        schoolId: schoolId,
        teacherId: data.teacherId,
        day: data.day,
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
        id: data.id ? { not: data.id } : undefined, // Exclude self if an update
      },
      select: { id: true }
    });

    if (overlappingLesson) {
      return {
        success: false,
        error: true,
        message: "Teacher scheduling conflict: The selected teacher already has another lesson scheduled during this time."
      };
    }

    // Existing Class Conflict Check 
    const overlappingClassLesson = await prisma.lesson.findFirst({
      where: {
        schoolId: schoolId,
        classId: data.classId, 
        day: data.day,
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
        id: data.id ? { not: data.id } : undefined, // Exclude self if an update
      },
      select: { id: true }
    });

    if (overlappingClassLesson) {
      return {
        success: false,
        error: true,
        message: "Class scheduling conflict: This class already has another lesson scheduled during this time."
      };
    }

    await prisma.lesson.create({
      data: {
        name: data.name,
        day: data.day,
        startTime: lessonStartTime, // Use Date objects
        endTime: lessonEndTime,     // Use Date objects
        subjectId: data.subjectId,
        classId: data.classId,
        teacherId: data.teacherId,
        roomId: data.roomId || null, // --- NEW: Add roomId ---
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/list/lessons`); // Ensure this path matches admin lesson list
    revalidatePath(`/schools/${schoolId}/admin/schedule`); // Revalidate admin schedule page
    return { success: true, error: false, message: "Lesson created successfully." };
  } catch (err) {
    console.error("Error creating lesson:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to create lesson." };
  }
};

export const updateLesson = async (
  currentState: ActionState,
  data: LessonSchema
): Promise<ActionState> => {
  if (!data.id) {
    return { success: false, error: true, message: "Lesson ID missing." };
  }
  try {
    const authUser = await getVerifiedAuthUser(); // Get authenticated user
    if (!authUser || !authUser.schoolId) {
      return { success: false, error: true, message: "User not authenticated or not associated with a school." };
    }
    const schoolId = authUser.schoolId; // Use schoolId from authenticated user

    // Verify the lesson being updated belongs to the school
    const lessonExists = await prisma.lesson.findUnique({ where: { id: data.id, schoolId: schoolId }, select: { id: true } });
    if (!lessonExists) return { success: false, error: true, message: "Lesson not found in this school." };

    // Validate related entities belong to the same school
    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId, schoolId: schoolId }, select: { id: true } });
    if (!subject) return { success: false, error: true, message: "Selected subject not found in this school." };
    const classExists = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, select: { id: true } });
    if (!classExists) return { success: false, error: true, message: "Selected class not found in this school." };
    const teacher = await prisma.teacher.findUnique({ where: { id: data.teacherId, schoolId: schoolId }, select: { id: true } });
    if (!teacher) return { success: false, error: true, message: "Selected teacher not found in this school." };

    // --- NEW: Validate Room if roomId is provided ---
    if (data.roomId) {
      const room = await prisma.room.findUnique({ where: { id: data.roomId, schoolId: schoolId }, select: { id: true } });
      if (!room) return { success: false, error: true, message: "Selected room not found in this school." };
    }
    // --- END NEW ---

    // MODIFIED Teacher Availability Check Logic (Default Available 8 AM - 5 PM Weekdays)
    const lessonStartTime = new Date(data.startTime);
    const lessonEndTime = new Date(data.endTime);

    if (lessonEndTime <= lessonStartTime) {
        return { success: false, error: true, message: "Lesson end time must be after start time." };
    }

    const DEFAULT_WORK_START_HOUR = 8;
    const DEFAULT_WORK_END_HOUR = 17;
    const lessonDay = data.day; 

    if (lessonDay === Day.SATURDAY || lessonDay === Day.SUNDAY) {
        const dayString: string = lessonDay; // Explicitly type as string
        return {
            success: false,
            error: true,
            message: `Lessons cannot be scheduled on ${dayString.toLowerCase()}s (outside default working days).`
        };
    }

    const lessonStartHour = lessonStartTime.getHours();
    const lessonEndHour = lessonEndTime.getHours();
    const lessonEndMinutes = lessonEndTime.getMinutes();

    const isWithinDefaultHours = 
        lessonStartHour >= DEFAULT_WORK_START_HOUR &&
        (lessonEndHour < DEFAULT_WORK_END_HOUR || (lessonEndHour === DEFAULT_WORK_END_HOUR && lessonEndMinutes === 0));

    if (!isWithinDefaultHours) {
        return {
            success: false,
            error: true,
            message: `Lesson time is outside default working hours (${DEFAULT_WORK_START_HOUR}:00 - ${DEFAULT_WORK_END_HOUR}:00 for weekdays).`
        };
    }

    const unavailableSlots = await prisma.teacherAvailability.findMany({
        where: {
            teacherId: data.teacherId,
            schoolId: schoolId,
            dayOfWeek: lessonDay,
            isAvailable: false, 
        }
    });

    const lessonStartActual = new Date(data.startTime); // Actual lesson start datetime
    const lessonEndActual = new Date(data.endTime);   // Actual lesson end datetime

    const conflictingUnavailableSlot = unavailableSlots.find(slot => {
        const dbSlotStart = new Date(slot.startTime); // Slot start from DB (reference date)
        const dbSlotEnd = new Date(slot.endTime);     // Slot end from DB (reference date)

        // Normalize slot times to the lesson's actual date for comparison
        const effectiveSlotStart = new Date(lessonStartActual);
        effectiveSlotStart.setHours(dbSlotStart.getHours(), dbSlotStart.getMinutes(), dbSlotStart.getSeconds(), dbSlotStart.getMilliseconds());
        effectiveSlotStart.setFullYear(lessonStartActual.getFullYear(), lessonStartActual.getMonth(), lessonStartActual.getDate());

        const effectiveSlotEnd = new Date(lessonStartActual);
        effectiveSlotEnd.setHours(dbSlotEnd.getHours(), dbSlotEnd.getMinutes(), dbSlotEnd.getSeconds(), dbSlotEnd.getMilliseconds());
        effectiveSlotEnd.setFullYear(lessonStartActual.getFullYear(), lessonStartActual.getMonth(), lessonStartActual.getDate());

        // Standard overlap condition
        return lessonStartActual < effectiveSlotEnd && lessonEndActual > effectiveSlotStart;
    });

    if (conflictingUnavailableSlot) {
        return {
            success: false,
            error: true,
            message: "Lesson time conflicts with a period the teacher has marked as UNAVAILABLE."
        };
    }
    // END: MODIFIED Teacher Availability Check

    // Existing Teacher Lesson Conflict Check
    const overlappingLesson = await prisma.lesson.findFirst({
      where: {
        schoolId: schoolId,
        teacherId: data.teacherId,
        day: data.day,
        id: { not: data.id }, // Exclude the current lesson being updated
        startTime: { lt: lessonEndTime }, // Use Date objects for comparison
        endTime: { gt: lessonStartTime }, // Use Date objects for comparison
      },
       select: { id: true }
    });

    if (overlappingLesson) {
      return {
        success: false,
        error: true,
        message: "Teacher scheduling conflict: The selected teacher already has another lesson scheduled during this time."
      };
    }

    // Existing Class Conflict Check
    const overlappingClassLesson = await prisma.lesson.findFirst({
      where: {
        schoolId: schoolId,
        classId: data.classId,
        day: data.day,
        id: { not: data.id }, // Exclude the current lesson being updated
        startTime: { lt: lessonEndTime }, // Use Date objects for comparison
        endTime: { gt: lessonStartTime }, // Use Date objects for comparison
      },
       select: { id: true }
    });

    if (overlappingClassLesson) {
      return {
        success: false,
        error: true,
        message: "Class scheduling conflict: This class already has another lesson scheduled during this time."
      };
    }

    await prisma.lesson.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
        name: data.name,
        day: data.day,
        startTime: lessonStartTime, // Use Date objects
        endTime: lessonEndTime,     // Use Date objects
        subjectId: data.subjectId,
        classId: data.classId,
        teacherId: data.teacherId,
        roomId: data.roomId || null, // --- NEW: Add roomId ---
      },
    });

    revalidatePath(`/schools/${schoolId}/list/lessons`);
    revalidatePath(`/schools/${schoolId}/admin/schedule`);
    return { success: true, error: false, message: "Lesson updated successfully." };
  } catch (err) {
    console.error("Error updating lesson:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to update lesson." };
  }
};

export const deleteLesson = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
  if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Lesson ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify the lesson being deleted belongs to the school
    const lessonExists = await prisma.lesson.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
    if (!lessonExists) return { success: false, error: true, message: "Lesson not found in this school." };

    // Dependencies: Exams, Assignments, Attendances linked. Schema cascade should handle.
    await prisma.lesson.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/lessons`);
    return { success: true, error: false, message: "Lesson deleted." };
  } catch (err) {
    console.error("Error deleting lesson:", err);
     // Handle potential FK constraint errors if cascade isn't set up correctly
    if ((err as any)?.code === 'P2014' || (err as any)?.code === 'P2003') {
         return { success: false, error: true, message: "Cannot delete lesson. It might still have related exams, assignments, or attendance records." };
    }
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete lesson." };
  }
};

// --- NEW ACTION for Calendar Drag/Drop/Resize ---

// Define the input schema for updating time/day
const UpdateLessonTimeSchema = z.object({
  id: z.number(),
  startTime: z.date(),
  endTime: z.date(),
  day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]),
});

// Type for the input data
type UpdateLessonTimeData = z.infer<typeof UpdateLessonTimeSchema>;

export const updateLessonTime = async (
  currentState: ActionState,
  data: UpdateLessonTimeData
): Promise<ActionState> => {
  // Validate input data
  const validatedFields = UpdateLessonTimeSchema.safeParse(data);
  if (!validatedFields.success) {
    return {
      success: false,
      error: true,
      message: "Invalid data format: " + validatedFields.error.errors.map(e => e.message).join(", "),
    };
  }

  const { id, startTime, endTime, day } = validatedFields.data;

  try {
    const schoolId = await getCurrentUserSchoolId();

    // 1. Fetch the original lesson to get teacherId and classId
    const originalLesson = await prisma.lesson.findUnique({
      where: { id: id, schoolId: schoolId },
      select: { teacherId: true, classId: true },
    });

    if (!originalLesson) {
      return { success: false, error: true, message: "Lesson not found." };
    }

    // 2. Perform Teacher Conflict Check (using original teacherId and NEW times/day)
    const teacherConflict = await prisma.lesson.findFirst({
      where: {
        schoolId: schoolId,
        teacherId: originalLesson.teacherId,
        day: day,
        id: { not: id },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    });

    if (teacherConflict) {
      return {
        success: false,
        error: true,
        message: "Teacher scheduling conflict with the new time.",
      };
    }

    // 3. Perform Class Conflict Check (using original classId and NEW times/day)
    const classConflict = await prisma.lesson.findFirst({
      where: {
        schoolId: schoolId,
        classId: originalLesson.classId,
        day: day,
        id: { not: id },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    });

    if (classConflict) {
      return {
        success: false,
        error: true,
        message: "Class scheduling conflict with the new time.",
      };
    }

    // 4. Update the lesson if no conflicts
    await prisma.lesson.update({
      where: {
        id: id,
        schoolId: schoolId, // Ensure update targets the correct school
      },
      data: {
        startTime: startTime,
        endTime: endTime,
        day: day,
      },
    });

    // Revalidate paths relevant to schedule views
    revalidatePath(`/schools/${schoolId}/list/lessons`);
    revalidatePath(`/schools/${schoolId}/admin/schedule`); // Revalidate the admin schedule page
    // Potentially revalidate student/teacher dashboards if they show schedule
    // revalidatePath(`/schools/${schoolId}/student`);
    // revalidatePath(`/schools/${schoolId}/teacher`);

    return { success: true, error: false, message: "Lesson rescheduled successfully." };

  } catch (err) {
    console.error("Error updating lesson time:", err);
    return {
      success: false,
      error: true,
      message: err instanceof Error ? err.message : "Failed to update lesson schedule.",
    };
  }
};

// Assignment actions
export const createAssignment = async (
  currentState: ActionState,
  data: AssignmentSchema
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate Lesson belongs to the school
    const lesson = await prisma.lesson.findUnique({ where: { id: data.lessonId, schoolId: schoolId }, select: { id: true } });
    if (!lesson) return { success: false, error: true, message: "Selected lesson not found in this school." };

    await prisma.assignment.create({
      data: {
        title: data.title,
        startDate: data.startDate,
        dueDate: data.dueDate,
        lessonId: data.lessonId,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/assignments`);
    return { success: true, error: false, message: "Assignment created." };
  } catch (err) {
    console.error("Error creating assignment:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to create assignment." };
  }
};

export const updateAssignment = async (
  currentState: ActionState,
  data: AssignmentSchema
): Promise<ActionState> => {
  if (!data.id) {
    return { success: false, error: true, message: "Assignment ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate Lesson belongs to the school
    const lesson = await prisma.lesson.findUnique({ where: { id: data.lessonId, schoolId: schoolId }, select: { id: true } });
    if (!lesson) return { success: false, error: true, message: "Selected lesson not found in this school." };

    // Verify Assignment belongs to the school before update
    const assignmentExists = await prisma.assignment.findUnique({ where: { id: data.id, schoolId: schoolId }, select: { id: true } });
    if (!assignmentExists) return { success: false, error: true, message: "Assignment not found in this school." };

    await prisma.assignment.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
        title: data.title,
        startDate: data.startDate,
        dueDate: data.dueDate,
        lessonId: data.lessonId,
      },
    });

    revalidatePath(`/schools/${schoolId}/assignments`);
    return { success: true, error: false, message: "Assignment updated." };
  } catch (err) {
    console.error("Error updating assignment:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to update assignment." };
  }
};

export const deleteAssignment = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
  if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Assignment ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify Assignment belongs to the school before delete
    const assignmentExists = await prisma.assignment.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
    if (!assignmentExists) return { success: false, error: true, message: "Assignment not found in this school." };

    // Dependencies: Results linked. Schema cascade should handle.
    await prisma.assignment.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/assignments`);
    return { success: true, error: false, message: "Assignment deleted." };
  } catch (err) {
    console.error("Error deleting assignment:", err);
    // Handle potential FK constraint errors
    if ((err as any)?.code === 'P2014' || (err as any)?.code === 'P2003') {
         return { success: false, error: true, message: "Cannot delete assignment. It might still have related results." };
    }
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete assignment." };
  }
};

// Parent actions
export const createParent = async (
  currentState: ActionState,
  data: ParentSchema
): Promise<ActionState> => {
  // Make email optional for parent creation, but username is key for Auth
  if (!data.username || !data.password || data.password.length < 8) {
    return { success: false, error: true, message: "Username and Password (min 8 chars) are required for new parents." };
  }
  // Email can be optional if parentSchema allows it

  let createdAuthId: string | undefined;
  try {
    const schoolId = await getCurrentUserSchoolId();
    const hashedPassword = await hashPassword(data.password);

    await prisma.$transaction(async (tx) => {
      // 1. Create Auth record
      const newAuthRecord = await tx.auth.create({
        data: {
          username: data.username, // Ensure username is provided for Auth record
          email: data.email && data.email.trim() !== "" ? data.email : undefined, // Email is optional for Auth
          password: hashedPassword,
          role: "parent",
          schoolId: schoolId,
        },
      });
      createdAuthId = newAuthRecord.id;

    // 2. Create Prisma Parent record
      await tx.parent.create({
      data: {
          // Parent.id will be auto-generated (CUID)
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email && data.email.trim() !== "" ? data.email : null, // Store null for empty email in Parent
        phone: data.phone || null,
        address: data.address,
        schoolId: schoolId,
          authId: createdAuthId, // Link to the Auth table
      },
      });
    });

    revalidatePath(`/schools/${schoolId}/list/parents`); // Corrected path
    return { success: true, error: false, message: "Parent created." };
  } catch (err: any) {
    console.error("Error creating parent:", err);
    let errMsg = "Failed to create parent.";
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.target as string[] | undefined;
        if (target && target.includes('email') && target.includes('Auth_email_key')) {
          errMsg = "This email is already registered.";
        } else if (target && (target.includes('username') || target.includes('Parent_username_key'))) {
            errMsg = "This username is already taken by another parent.";
        } else if (target && target.includes('email') && target.includes('Parent_email_key')) {
            errMsg = "This email is already used by another parent profile.";
        } else {
          errMsg = "A parent with similar identifying information already exists.";
        }
     } else if (err instanceof Error) {
         errMsg = err.message;
     }
    return { success: false, error: true, message: errMsg };
  }
};

export const updateParent = async (
  currentState: ActionState,
  data: ParentSchema
): Promise<ActionState> => {
  if (!data.id) { // data.id is Parent.id
    return { success: false, error: true, message: "Parent ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    const parentToUpdate = await prisma.parent.findUnique({
      where: { id: data.id, schoolId: schoolId },
      select: { authId: true }
    });

    if (!parentToUpdate || !parentToUpdate.authId) {
      return { success: false, error: true, message: "Parent not found or has no associated auth record." };
    }

    // 1. Update Auth record (password if provided)
    if (data.password && data.password !== "") {
      const hashedPassword = await hashPassword(data.password);
      await prisma.auth.update({
        where: { id: parentToUpdate.authId },
        data: { password: hashedPassword },
      });
    }

    // 2. Update Prisma Parent record
    await prisma.parent.update({
      where: {
        id: data.id, // Parent.id
        schoolId: schoolId,
      },
      data: {
        username: data.username,
        name: data.name,
        surname: data.surname,
        email: data.email && data.email.trim() !== "" ? data.email : null, // This is Parent.email
        phone: data.phone || null,
        address: data.address,
      },
    });

    revalidatePath(`/schools/${schoolId}/list/parents`); // Corrected path
    return { success: true, error: false, message: "Parent updated." };
  } catch (err: any) {
    console.error("Error updating parent:", err);
     let errMsg = "Failed to update parent.";
     if (err.code === 'P2002') {
        // Handle P2002 for Parent username/email or Auth email
        errMsg = "A parent with this username or email might already exist.";
     }
    return { success: false, error: true, message: errMsg };
  }
};

export const deleteParent = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const id = formData.get("id") as string; // Parent.id
  if (!id) {
      return { success: false, error: true, message: "Parent ID missing." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    const parentToDelete = await prisma.parent.findUnique({
      where: { id: id, schoolId: schoolId },
      select: { authId: true }
    });

    if (!parentToDelete) {
      return { success: false, error: true, message: "Parent not found in this school." };
    }

    // Check for dependent students before deleting Auth record
    const studentCount = await prisma.student.count({ where: { parentId: id, schoolId: schoolId } });
    if (studentCount > 0) {
        return {
            success: false,
            error: true,
            message: `Cannot delete parent. They are still associated with ${studentCount} student(s). Please reassign or delete the students first.`
        };
    }

    await prisma.$transaction(async (tx) => {
    // 1. Delete Prisma Parent record
      await tx.parent.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

      // 2. Delete associated Auth record if authId exists
      if (parentToDelete.authId) {
        await tx.auth.delete({
          where: { id: parentToDelete.authId },
        });
    }
    });

    revalidatePath(`/schools/${schoolId}/list/parents`); // Corrected path
    return { success: true, error: false, message: "Parent deleted." };
  } catch (err: any) {
    console.error("Error deleting parent:", err);
    // The student check should prevent most FK issues for Parent deletion related to students.
    // If other relations exist, they might cause P2003/P2014.
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete parent." };
  }
};

// Result actions
export const createResult = async (
  currentState: ActionState,
  data: ResultSchema
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate related entities belong to the same school
    const student = await prisma.student.findUnique({ where: { id: data.studentId, schoolId: schoolId }, select: { id: true } });
    if (!student) return { success: false, error: true, message: "Selected student not found in this school." };

    if (data.examId) {
        const exam = await prisma.exam.findUnique({ where: { id: data.examId, schoolId: schoolId }, select: { id: true } });
        if (!exam) return { success: false, error: true, message: "Selected exam not found in this school." };
    }

    if (data.assignmentId) {
        const assignment = await prisma.assignment.findUnique({ where: { id: data.assignmentId, schoolId: schoolId }, select: { id: true } });
        if (!assignment) return { success: false, error: true, message: "Selected assignment not found in this school." };
    }

    // Ensure either examId or assignmentId is provided (based on your schema logic)
    if (!data.examId && !data.assignmentId) {
       return { success: false, error: true, message: "Result must be linked to an exam or an assignment." };
    }
    if (data.examId && data.assignmentId) {
       return { success: false, error: true, message: "Result cannot be linked to both an exam and an assignment." };
    }

    await prisma.result.create({
      data: {
        score: data.score,
        studentId: data.studentId,
        examId: data.examId || null,
        assignmentId: data.assignmentId || null,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/results`);
    return { success: true, error: false, message: "Result created." };
  } catch (err) {
    console.error("Error creating result:", err);
    // Handle potential unique constraints if needed
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to create result." };
  }
};

export const updateResult = async (
  currentState: ActionState,
  data: ResultSchema
): Promise<ActionState> => {
  if (!data.id) {
    return { success: false, error: true, message: "Result ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify result exists in the school
    const resultExists = await prisma.result.findUnique({ where: { id: data.id, schoolId: schoolId }, select: { id: true } });
    if (!resultExists) return { success: false, error: true, message: "Result not found in this school." };

    // Validate related entities belong to the same school
    const student = await prisma.student.findUnique({ where: { id: data.studentId, schoolId: schoolId }, select: { id: true } });
    if (!student) return { success: false, error: true, message: "Selected student not found in this school." };

    if (data.examId) {
        const exam = await prisma.exam.findUnique({ where: { id: data.examId, schoolId: schoolId }, select: { id: true } });
        if (!exam) return { success: false, error: true, message: "Selected exam not found in this school." };
    }

    if (data.assignmentId) {
        const assignment = await prisma.assignment.findUnique({ where: { id: data.assignmentId, schoolId: schoolId }, select: { id: true } });
        if (!assignment) return { success: false, error: true, message: "Selected assignment not found in this school." };
    }

    // Ensure consistency
    if (!data.examId && !data.assignmentId) {
       return { success: false, error: true, message: "Result must be linked to an exam or an assignment." };
    }
    if (data.examId && data.assignmentId) {
       return { success: false, error: true, message: "Result cannot be linked to both an exam and an assignment." };
    }

    await prisma.result.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
        score: data.score,
        studentId: data.studentId,
        examId: data.examId || null,
        assignmentId: data.assignmentId || null,
      },
    });

    revalidatePath(`/schools/${schoolId}/results`);
    return { success: true, error: false, message: "Result updated." };
  } catch (err) {
    console.error("Error updating result:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to update result." };
  }
};

export const deleteResult = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
   if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Result ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify result exists in the school before delete
     const resultExists = await prisma.result.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
     if (!resultExists) return { success: false, error: true, message: "Result not found in this school." };

    await prisma.result.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/results`);
    return { success: true, error: false, message: "Result deleted." };
  } catch (err) {
    console.error("Error deleting result:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete result." };
  }
};

// Announcement actions - UPDATED FOR MULTI-TENANCY
export const createAnnouncement = async (
  currentState: ActionState,
  data: AnnouncementSchema
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate classId if provided
    if (data.classId) {
      const classExists = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, select: { id: true } });
      if (!classExists) return { success: false, error: true, message: "Selected class not found in this school." };
    }

    await prisma.announcement.create({
      data: {
        title: data.title,
        content: data.content, // Changed from description
        // date is handled by createdAt @default(now())
        classId: data.classId || null,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/announcements`);
    return { success: true, error: false, message: "Announcement created." };
  } catch (err) {
    console.error("Error creating announcement:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to create announcement." };
  }
};

export const updateAnnouncement = async (
  currentState: ActionState,
  data: AnnouncementSchema
): Promise<ActionState> => {
  if (!data.id) {
    return { success: false, error: true, message: "Announcement ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify announcement exists in the school
    const announcementExists = await prisma.announcement.findUnique({ where: { id: data.id, schoolId: schoolId }, select: { id: true } });
    if (!announcementExists) return { success: false, error: true, message: "Announcement not found in this school." };

    // Validate classId if provided
    if (data.classId) {
      const classExists = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, select: { id: true } });
      if (!classExists) return { success: false, error: true, message: "Selected class not found in this school." };
    }

    await prisma.announcement.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
        title: data.title,
        content: data.content, // Changed from description
        // date is handled by createdAt / updatedAt
        classId: data.classId || null,
      },
    });

    revalidatePath(`/schools/${schoolId}/announcements`);
    return { success: true, error: false, message: "Announcement updated." };
  } catch (err) {
    console.error("Error updating announcement:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to update announcement." };
  }
};

export const deleteAnnouncement = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
  if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Announcement ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify announcement exists in the school before delete
     const announcementExists = await prisma.announcement.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
     if (!announcementExists) return { success: false, error: true, message: "Announcement not found in this school." };

    await prisma.announcement.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/announcements`);
    return { success: true, error: false, message: "Announcement deleted." };
  } catch (err) {
    console.error("Error deleting announcement:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete announcement." };
  }
};

// Event actions
export const createEvent = async (
  currentState: ActionState,
  data: EventSchema
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate classId if provided
    if (data.classId) {
      const classExists = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, select: { id: true } });
      if (!classExists) return { success: false, error: true, message: "Selected class not found in this school." };
    }

    // --- NEW: Validate Room if roomId is provided ---
    if (data.roomId) {
      const room = await prisma.room.findUnique({ where: { id: data.roomId, schoolId: schoolId }, select: { id: true } });
      if (!room) return { success: false, error: true, message: "Selected room not found in this school." };
    }
    // --- END NEW ---

    await prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        classId: data.classId || null,
        roomId: data.roomId || null, // --- NEW: Add roomId ---
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/events`);
    return { success: true, error: false, message: "Event created." };
  } catch (err) {
    console.error("Error creating event:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to create event." };
  }
};

export const updateEvent = async (
  currentState: ActionState,
  data: EventSchema
): Promise<ActionState> => {
  if (!data.id) {
    return { success: false, error: true, message: "Event ID missing." };
  }
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify event exists in the school
    const eventExists = await prisma.event.findUnique({ where: { id: data.id, schoolId: schoolId }, select: { id: true } });
    if (!eventExists) return { success: false, error: true, message: "Event not found in this school." };

     // Validate classId if provided
    if (data.classId) {
      const classExists = await prisma.class.findUnique({ where: { id: data.classId, schoolId: schoolId }, select: { id: true } });
      if (!classExists) return { success: false, error: true, message: "Selected class not found in this school." };
    }

    // --- NEW: Validate Room if roomId is provided ---
    if (data.roomId) {
      const room = await prisma.room.findUnique({ where: { id: data.roomId, schoolId: schoolId }, select: { id: true } });
      if (!room) return { success: false, error: true, message: "Selected room not found in this school." };
    }
    // --- END NEW ---

    await prisma.event.update({
      where: {
        id: data.id,
        schoolId: schoolId,
      },
      data: {
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        classId: data.classId || null,
        roomId: data.roomId || null, // --- NEW: Add roomId ---
      },
    });

    revalidatePath(`/schools/${schoolId}/events`);
    return { success: true, error: false, message: "Event updated." };
  } catch (err) {
    console.error("Error updating event:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to update event." };
  }
};

export const deleteEvent = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
  if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Event ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify event exists in the school before delete
     const eventExists = await prisma.event.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
     if (!eventExists) return { success: false, error: true, message: "Event not found in this school." };

    await prisma.event.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/events`);
    return { success: true, error: false, message: "Event deleted." };
  } catch (err) {
    console.error("Error deleting event:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete event." };
  }
};

// Attendance Actions
export const createAttendance = async (
  currentState: ActionState,
  data: AttendanceSchema
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate Lesson belongs to the school
    const lesson = await prisma.lesson.findUnique({ where: { id: data.lessonId, schoolId: schoolId }, select: { id: true } });
    if (!lesson) return { success: false, error: true, message: "Selected lesson not found in this school." };

    // Create an attendance record for each student, ensuring student belongs to the school
    // Use a transaction for atomicity
    await prisma.$transaction(async (tx) => {
        for (const studentAttendance of data.studentAttendance) {

            // Verify student belongs to the school
             const student = await tx.student.findUnique({ where: { id: studentAttendance.studentId, schoolId: schoolId }, select: { id: true } });
             if (!student) {
                 // If a student doesn't belong, the whole transaction should fail.
                 throw new Error(`Student with ID ${studentAttendance.studentId} not found in this school.`);
             }

             // Create attendance record within the transaction
            await tx.attendance.create({
                data: {
                date: data.date,
                status: studentAttendance.status, // Changed from present
                studentId: studentAttendance.studentId,
                lessonId: data.lessonId,
                schoolId: schoolId,
                },
            });
        }
    });

    revalidatePath(`/schools/${schoolId}/attendance`); // Adjust revalidation path
    return { success: true, error: false, message: "Attendance recorded." };
  } catch (err) {
    console.error("Error creating attendance:", err);
    // Handle potential unique constraints (date, student, lesson)
     let errMsg = err instanceof Error ? err.message : "Failed to record attendance.";
    if ((err as any)?.code === 'P2002') {
        errMsg = "Attendance for one or more students on this date/lesson already exists.";
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const updateAttendance = async (
  currentState: ActionState,
  data: AttendanceSchema
): Promise<ActionState> => {
  try {
    const schoolId = await getCurrentUserSchoolId();

    // Validate Lesson belongs to the school
    const lesson = await prisma.lesson.findUnique({ where: { id: data.lessonId, schoolId: schoolId }, select: { id: true } });
    if (!lesson) return { success: false, error: true, message: "Selected lesson not found in this school." };

     // Use a transaction for atomicity
    await prisma.$transaction(async (tx) => {
        // Delete existing attendance records for this lesson and date within the school
        await tx.attendance.deleteMany({
        where: {
            lessonId: data.lessonId,
            date: {
            // Ensure date comparison handles timezone correctly if necessary
            // Using gte/lt might be safer depending on how dates are stored/compared
            equals: data.date,
            },
            schoolId: schoolId, // Scope delete to the school
        },
        });

        // Create new attendance records, ensuring students belong to the school
        for (const studentAttendance of data.studentAttendance) {
             // Verify student belongs to the school
             const student = await tx.student.findUnique({ where: { id: studentAttendance.studentId, schoolId: schoolId }, select: { id: true } });
             if (!student) {
                 throw new Error(`Student with ID ${studentAttendance.studentId} not found in this school during update.`);
             }

            await tx.attendance.create({
                data: {
                date: data.date,
                status: studentAttendance.status, // Changed from present
                studentId: studentAttendance.studentId,
                lessonId: data.lessonId,
                schoolId: schoolId,
                },
            });
        }
    });

    revalidatePath(`/schools/${schoolId}/attendance`);
    return { success: true, error: false, message: "Attendance updated." };
  } catch (err) {
    console.error("Error updating attendance:", err);
     let errMsg = err instanceof Error ? err.message : "Failed to update attendance.";
    if ((err as any)?.code === 'P2002') {
        // This might occur if the delete/create logic has timing issues under high load,
        // or if the unique constraint involves more than just date/lesson/student.
        errMsg = "Failed to update attendance due to a conflict. Please try again.";
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const deleteAttendance = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string; // Assuming ID identifies a single attendance record
  const id = parseInt(idString);
  if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Attendance Record ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify attendance record exists in the school before delete
    const attendanceExists = await prisma.attendance.findUnique({ where: { id: id, schoolId: schoolId }, select: { id: true } });
    if (!attendanceExists) return { success: false, error: true, message: "Attendance record not found in this school." };


    await prisma.attendance.delete({
      where: {
        id: id,
        schoolId: schoolId, // Ensure delete targets the correct school
      },
    });

     revalidatePath(`/schools/${schoolId}/attendance`);
    return { success: true, error: false, message: "Attendance record deleted." };
  } catch (err) {
    console.error("Error deleting attendance record:", err);
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete attendance record." };
  }
};

// --- READ OPERATIONS --- //

export const getAttendanceByLessonAndDate = async (lessonId: number, date: Date) => {
  try {
    const schoolId = await getCurrentUserSchoolId(); // Get schoolId

    // Verify lesson belongs to the school before fetching attendance
    const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId, schoolId: schoolId }, select: { id: true }
    });
    if (!lesson) {
        console.warn(`Lesson ${lessonId} not found in school ${schoolId} for attendance check.`);
        // Decide return type on failure - empty array or throw?
        // Returning empty array might hide issues but could be desired UI behavior.
        return [];
    }

    // Fetch attendance for the specific lesson AND school
    const attendance = await prisma.attendance.findMany({
      where: {
        lessonId: lessonId,
        date: {
             // Consider date range (gte/lt) if timezones/precision matter
             equals: date,
        },
        schoolId: schoolId, // Filter by schoolId
      },
      include: {
        student: true, // Ensure student data is also scoped or handle privacy
      },
       orderBy: {
           student: { // Example: order by student name
               surname: 'asc',
               name: 'asc'
            }
       }
    });
    return attendance;
  } catch (err) {
    console.error("Error fetching attendance:", err);
    // Re-throw or return empty array depending on desired error handling
    // throw err;
    return [];
  }
};


export const getStudentsByLesson = async (lessonId: number) => {
  try {
     const schoolId = await getCurrentUserSchoolId(); // Get schoolId

     // Verify lesson belongs to the school
     const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId, schoolId: schoolId }, select: { classId: true }
    });
    if (!lesson || !lesson.classId) { // Check if lesson or its classId is null
        console.warn(`Lesson ${lessonId} or its associated class not found in school ${schoolId} for student fetch.`);
        return [];
    }

    // Find students in the class associated with the lesson in this school
    const students = await prisma.student.findMany({
      where: {
        classId: lesson.classId,
        schoolId: schoolId, // Ensure students are also from the same school
      },
       orderBy: { // Example ordering
           surname: 'asc',
           name: 'asc'
       }
    });
    return students;
  } catch (err) {
    console.error("Error fetching students by lesson:", err);
    // throw err;
    return [];
  }
};

// Function to get school name by ID (for Navbar display)
export const getSchoolNameById = async (schoolId: string): Promise<string | null> => {
  try {
    // Optional: Add authentication check if needed, though schoolId might be considered
    // less sensitive than other data if the user already has access via URL.
    // const { userId } = auth();
    // if (!userId) throw new Error("Not authenticated");

    // Verify the user accessing this belongs to the school?
    // This might be overly restrictive if just displaying the name is okay.
    // const userSchoolId = await getCurrentUserSchoolId();
    // if (userSchoolId !== schoolId) {
    //   console.warn(`User attempted to fetch name for school ${schoolId} but belongs to ${userSchoolId}`);
    //   return null; // Or throw error?
    // }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });

    return school?.name ?? null;
  } catch (error) {
    console.error(`Error fetching school name for ID ${schoolId}:`, error);
    return null; // Return null on error
  }
};

export async function getCurrentUserSchoolId(): Promise<string> {
  const cookieStore = cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) {
    console.error("getCurrentUserSchoolId: No auth_token cookie found.");
    throw new Error("User not authenticated: No token provided.");
    }

  let authUser: AuthUser | null;
    try {
    authUser = await verifyToken(token);
  } catch (error) {
    console.error("getCurrentUserSchoolId: Error verifying token:", error);
    throw new Error("User not authenticated: Token verification failed.");
  }

  if (!authUser) {
    console.error("getCurrentUserSchoolId: Invalid token or user data not found in token.");
    throw new Error("User not authenticated: Invalid token.");
    }

  const schoolId = authUser.schoolId;

    if (!schoolId) {
    console.error(`getCurrentUserSchoolId: School ID not found in token for user ${authUser.id}`);
    throw new Error("User is not associated with a school or schoolId missing in token.");
  }
    return schoolId;
}

export async function getActiveAcademicYearName(schoolId: string): Promise<string | null> {
  if (!schoolId) return null;
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { activeAcademicYearId: true }
    });

    if (school && school.activeAcademicYearId) {
      const academicYear = await prisma.academicYear.findUnique({
        where: { id: school.activeAcademicYearId },
        select: { name: true, isArchived: true }
      });
      // Only return the name if the active academic year is not archived
      if (academicYear && !academicYear.isArchived) {
        return academicYear.name;
      }
      return "No active year set"; // Or null, if preferred when active AY is archived or not found
    }
    return "No active year set"; // Or null, if preferred
  } catch (error) {
    console.error(`Error fetching active academic year name for school ${schoolId}:`, error);
    return "Error fetching year"; // Or null
  }
}

// Type for the generic state returned by many actions
type ActionState = { success: boolean; error: boolean; message?: string };

// Define schema for the school creation input
const CreateSchoolSchema = z.object({
  schoolName: z.string().min(3, "School name must be at least 3 characters long.").max(100, "School name must be at most 100 characters long."),
  // Fields for existing authenticated user
  userId: z.string().cuid({ message: "Invalid user ID format." }).optional(),
  userEmail: z.string().email({ message: "Invalid email format for admin." }).optional(), // Used for username if userId is present
  // Fields for new user creating an account
  email: z.string().email({ message: "Invalid email format." }).optional(),
  password: z.string().min(8, "Password must be at least 8 characters long.").optional(),
}).refine(data => data.userId || (data.email && data.password), {
  message: "Either existing user ID or new user email and password must be provided.",
  path: ["userId"], // Or a more general path
}).refine(data => data.userId ? !!data.userEmail : true, {
    message: "userEmail is required when userId is provided.",
    path: ["userEmail"],
});

// Type for the state returned by the school creation action
type CreateSchoolState = ActionState & { schoolId?: string; token?: string };

export const createSchoolAndAssignAdmin = async (
  currentState: CreateSchoolState,
  formData: FormData
): Promise<CreateSchoolState> => {

  const rawFormData = {
    schoolName: formData.get("schoolName"),
    // Ensure undefined if not present or null, instead of null
    userId: formData.get("userId") || undefined,
    userEmail: formData.get("userEmail") || undefined,
    email: formData.get("email") || undefined,
    password: formData.get("password") || undefined,
  };

  const validatedFields = CreateSchoolSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    // Consolidate error messages from Zod
    const errorMessages = validatedFields.error.errors.map(e => `${e.path.join('.') || 'form'}: ${e.message}`).join('; ');
    return {
      success: false,
      error: true,
      message: errorMessages || "Invalid input.",
    };
  }

  const { schoolName, userId, userEmail, email, password } = validatedFields.data;
  let newSchoolId: string | undefined;
  let newAuthToken: string | undefined;

  try {
    if (userId && userEmail) { // Scenario 1: Existing authenticated user
      const existingAuthUser = await prisma.auth.findUnique({ where: { id: userId } });
      if (!existingAuthUser) {
        return { success: false, error: true, message: "Authenticated user not found. Please sign in again." };
      }
      if (existingAuthUser.schoolId) {
        return { success: false, error: true, message: "User is already associated with a school." };
    }

      const adminUsername = userEmail.split('@')[0] || userId;

      await prisma.$transaction(async (tx) => {
      const newSchool = await tx.school.create({
          data: { name: schoolName },
        });
        newSchoolId = newSchool.id;

        await tx.auth.update({
          where: { id: userId },
          data: { schoolId: newSchoolId, role: 'admin' },
      });

      await tx.admin.create({
        data: {
          username: adminUsername,
            authId: userId,
            schoolId: newSchoolId,
        },
      });
      });
      // No new token needed for already authenticated user

    } else if (email && password) { // Scenario 2: New user creating account and school
      const existingUserByEmail = await prisma.auth.findUnique({ where: { email } });
      if (existingUserByEmail) {
        return { success: false, error: true, message: "An account with this email already exists. Please sign in or use a different email." };
      }

      const hashedPassword = await hashPassword(password);
      const adminUsername = email.split('@')[0] || 'admin'; // Basic username generation

      await prisma.$transaction(async (tx) => {
        const newSchool = await tx.school.create({
          data: { name: schoolName },
        });
      newSchoolId = newSchool.id;

        // For new user scenario, use provided email to derive Auth.username
        const authUsernameForNewUser = email ? email.split('@')[0] : `admin_${newSchool.id.substring(0, 8)}`;

        const newAuthUser = await tx.auth.create({
          data: {
            username: authUsernameForNewUser, // Provide username for Auth record
            email: email, // email is from validatedFields.data, can be undefined if not new user scenario
            password: hashedPassword, // Only present if new user scenario
            role: 'admin',
            schoolId: newSchoolId,
        },
      });

        await tx.admin.create({
          data: {
            username: adminUsername, // This is for Admin.username, can be different from Auth.username
            authId: newAuthUser.id,
            schoolId: newSchoolId,
          },
        });
        
        // Generate token for the new user
        const tokenPayload: AuthUser = {
            id: newAuthUser.id,
            username: newAuthUser.username, // Added username from the newAuthUser record
            email: newAuthUser.email || undefined, // Use email if present, else undefined
            role: newAuthUser.role as AuthUser['role'], // Cast role to AuthUser['role']
            schoolId: newAuthUser.schoolId!, // Handle null from DB - now asserted non-null
        };
        newAuthToken = await generateToken(tokenPayload);
      });

    } else {
      // This case should be caught by Zod refine, but as a fallback:
      return { success: false, error: true, message: "Invalid form data: Missing user identification or new account details." };
    }

    if (!newSchoolId) {
      throw new Error("School creation failed unexpectedly.");
    }

    revalidatePath('/');
    revalidatePath(`/schools/${newSchoolId}/admin`);
    revalidatePath('/create-school');

    return {
      success: true,
      error: false,
      message: newAuthToken ? "Account and school created successfully!" : "School created successfully! You are now the administrator.",
      schoolId: newSchoolId,
      token: newAuthToken, // This will be undefined for existing users, and populated for new users
    };

  } catch (err: any) {
    console.error("Error in createSchoolAndAssignAdmin:", err);
    let errorMessage = "An unexpected error occurred during school creation.";
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const target = err.meta?.target as string[] | undefined;
        if (target && target.includes('name') && target.includes('School_name_key')) {
          errorMessage = "A school with this name already exists.";
        } else if (target && target.includes('authId') && target.includes('Admin_authId_key')) {
          errorMessage = "This user is already an administrator.";
        } else if (target && target.includes('email') && (target.includes('Auth_email_key') || target.includes('auth_email_key'))) { // Check both potential casing
           errorMessage = "An account with this email already exists.";
        } else {
          errorMessage = "A unique constraint was violated. Please check your input.";
        }
      }
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }
    return {
      success: false,
      error: true,
      message: errorMessage,
    };
  }
};

// --- READ OPERATIONS --- //
// (Keep getSchoolNameById as is)

// ====================
// Helper function for auth checks in other actions if needed
// ====================
export async function getVerifiedAuthUser(): Promise<AuthUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

// ====================
// Grade Actions (and other actions needing admin check)
// ====================

// Refactored isAdminCheck (can be used by other actions)
async function isAdminOfSchool(schoolIdToCheck: string): Promise<boolean> {
  const authUser = await getVerifiedAuthUser();
  if (!authUser) return false;
  return authUser.role === 'admin' && authUser.schoolId === schoolIdToCheck;
}

// Example usage in a hypothetical createGrade action
export const createGrade = async (
  currentState: ActionState,
  formData: FormData 
): Promise<ActionState> => {
  const schoolId = await getCurrentUserSchoolId(); // Assumes admin must belong to a school
  if (!(await isAdminOfSchool(schoolId))) {
    return { success: false, error: true, message: "User is not an admin of this school." };
  }

  const level = formData.get("level") as string; // Changed from formData.get("name")
  if (!level || level.trim() === "") { // Added trim check
    return { success: false, error: true, message: "Grade level is required." }; // Updated message
    }
  try {
    await prisma.grade.create({
      data: {
        level: level, // Ensured this matches schema (level, not name)
        schoolId: schoolId,
      }
    });
    revalidatePath(`/schools/${schoolId}/list/grades`); // Corrected revalidatePath
    return { success: true, error: false, message: "Grade created." };
  } catch (e: any) {
    let errMsg = "Failed to create grade.";
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        errMsg = "A grade with this level already exists in this school.";
    } else if (e.message) {
      errMsg = e.message;
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const updateGrade = async (
  currentState: ActionState,
  formData: FormData // Changed from data: GradeSchema to formData: FormData
): Promise<ActionState> => {
  const rawFormData = {
    id: formData.get("id") as string | null,
    level: formData.get("level") as string | null,
  };

  // Validate the extracted data using GradeSchema
  const validatedFields = GradeSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      success: false,
      error: true,
      message: validatedFields.error.errors.map((e) => e.message).join(", "),
    };
  }

  // id from GradeSchema is z.number().optional(), so it's already number | undefined
  const { id: gradeId, level } = validatedFields.data; 

  if (gradeId === undefined) { // id will be undefined if not present or failed coercion to number
    return { success: false, error: true, message: "Grade ID is missing or invalid." };
  }
  
  // 'gradeId' is now the numeric ID. No need for parseInt.

  try {
    const schoolId = await getCurrentUserSchoolId(); // This returns Promise<string>

    const gradeExists = await prisma.grade.findUnique({
      where: { id: gradeId, schoolId: schoolId }, // Use gradeId directly
      select: { id: true },
    });
    if (!gradeExists) {
      return { success: false, error: true, message: "Grade not found in this school." };
    }

    await prisma.grade.update({
      where: {
        id: gradeId, // Use gradeId directly
        schoolId: schoolId,
      },
      data: {
        level: level, // level is from validatedFields.data
      },
    });

    revalidatePath(`/schools/${String(schoolId)}/grades`); // Explicitly cast schoolId to string
    return { success: true, error: false, message: "Grade updated successfully." };
  } catch (err: any) {
    console.error("Error updating grade:", err);
    let errMsg = "Failed to update grade.";
    if (err.code === 'P2002') {
      errMsg = "A grade with this level already exists in this school.";
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const deleteGrade = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const idString = formData.get("id") as string;
  const id = parseInt(idString);

  if (isNaN(id)) {
    return { success: false, error: true, message: "Invalid Grade ID." };
  }

  try {
    const schoolId = await getCurrentUserSchoolId();

    // Verify grade exists in the school before attempting to delete
    const gradeExists = await prisma.grade.findUnique({
      where: { id: id, schoolId: schoolId },
      select: { id: true } 
    });

    if (!gradeExists) {
      return { success: false, error: true, message: "Grade not found in this school." };
    }

    // Attempt to delete the grade
    await prisma.grade.delete({
      where: {
        id: id,
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/grades`); // Adjust path as needed
    return { success: true, error: false, message: "Grade deleted successfully." };
  } catch (err: any) {
    console.error("Error deleting grade:", err);
    // Handle potential errors, e.g., if the grade is still linked to classes
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2003: Foreign key constraint failed on the field: `modelName_fieldName_fkey`
      // This indicates that the grade is likely still associated with other records (e.g., Classes)
      if (err.code === 'P2003') {
        return { success: false, error: true, message: "Cannot delete grade. It may still be assigned to classes or students." };
      }
    }
    return { success: false, error: true, message: "Failed to delete grade. An unexpected error occurred." };
  }
};

// ... (The rest of your actions.ts file, many will need similar isAdminOfSchool checks or getCurrentUserSchoolId calls)
// Ensure to replace old isAdminCheck calls with isAdminOfSchool(schoolId)
// and remove any direct 'auth()' or 'clerkClient' usage in other functions.

// ==========================================================================
// BULK IMPORT ACTION TYPES
// ==========================================================================

// Type for the result returned by bulk actions
export type BulkActionResult = {
    successCount: number;
    errorCount: number;
    errors: { index: number, identifier?: string | null, message: string }[];
};

// Input type for bulk student creation
export type BulkStudentInput = {
    studentUsername: string;
    studentPassword?: string | null;
    studentFirstName?: string | null;
    studentLastName?: string | null;
    studentEmail: string;
    studentPhone?: string | null;
    studentAddress?: string | null;
    studentImageURL?: string | null;
    studentBloodType?: string | null;
    studentBirthday?: string | null; // CSVs usually provide strings; conversion to Date handled in action
    studentSex?: string | null; // Should match Prisma UserSex enum values ('MALE', 'FEMALE', 'OTHER')
    gradeLevel?: string | null;
    className?: string | null;
    parentUsername: string;
    parentPassword?: string | null;
    parentFirstName?: string | null;
    parentLastName?: string | null;
    parentEmail?: string | null; // Mandatory for new parent Auth record if parent doesn't exist
    parentPhone?: string | null;
    parentAddress?: string | null;
};

// Input type for bulk teacher creation
export type BulkTeacherInput = {
    teacherUsername: string;
    teacherPassword?: string | null;
    teacherFirstName?: string | null;
    teacherLastName?: string | null;
    teacherEmail: string;
    teacherPhone?: string | null;
    teacherAddress?: string | null;
    teacherImageURL?: string | null;
    teacherBloodType?: string | null;
    teacherBirthday?: string | null; // CSVs usually provide strings
    teacherSex?: string | null; // Should match Prisma UserSex enum values
    subjectNames?: string | null; // Comma-separated list of subject names
};

// Input type for bulk result creation
export type BulkResultInput = {
    studentUsername?: string | null;
    score?: string | null; // Will be parsed to float
    examTitle?: string | null;
    assignmentTitle?: string | null;
};

// Ensure this is at the very end or before any final closing brackets if inside a module.

// ==========================================================================
// BULK STUDENT CREATION
// ==========================================================================
export const bulkCreateStudents = async (
    currentState: BulkActionResult | null,
    studentsData: BulkStudentInput[],
    schoolIdOverride?: string
): Promise<BulkActionResult> => {
    let actualSchoolId: string;
    try {
        actualSchoolId = schoolIdOverride || await getCurrentUserSchoolId();
        if (!await isAdminOfSchool(actualSchoolId)) {
            return { successCount: 0, errorCount: studentsData.length, errors: [{ index: -1, identifier: "System", message: "Unauthorized: Only admins can perform bulk student imports." }] };
        }
    } catch (authError: any) {
        return { successCount: 0, errorCount: studentsData.length, errors: [{ index: -1, identifier: "System", message: authError.message || "Authentication error." }] };
    }

    if (!studentsData || studentsData.length === 0) {
        return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: "No student data provided." }] };
    }

    // NEW: Subscription Check
    const activeSubscriptionDetails = await getActiveSchoolSubscription(actualSchoolId);
    if (!activeSubscriptionDetails) {
        return {
            successCount: 0,
            errorCount: studentsData.length, // All rows fail due to no active subscription
            errors: [{ index: -1, identifier: "System", message: "No active subscription found for the school. Please subscribe to a plan to add students." }]
        };
    }

    const { plan } = activeSubscriptionDetails;

    if (plan.maxStudents !== null) {
        const currentStudentCount = await prisma.student.count({ where: { schoolId: actualSchoolId } });
        const slotsAvailable = plan.maxStudents - currentStudentCount;
        if (studentsData.length > slotsAvailable) {
            return {
                successCount: 0,
                errorCount: studentsData.length,
                errors: [{
                    index: -1,
                    identifier: "System",
                    message: `Cannot add ${studentsData.length} students. Your current plan allows a maximum of ${plan.maxStudents} students. You currently have ${currentStudentCount} students, with ${slotsAvailable > 0 ? slotsAvailable : 0} slot(s) available.`
                }]
            };
        }
    }
    // END NEW: Subscription Check

    let successCount = 0;
    const errors: BulkActionResult['errors'] = [];

    const [existingGrades, existingClasses] = await Promise.all([
        prisma.grade.findMany({ where: { schoolId: actualSchoolId }, select: { id: true, level: true } }),
        prisma.class.findMany({ where: { schoolId: actualSchoolId }, select: { id: true, name: true, capacity: true, _count: { select: { students: true } } } }),
    ]);

    const gradeMap = new Map(existingGrades.map(g => [g.level.toLowerCase(), g.id]));
    const classMap = new Map(existingClasses.map(c => [c.name.toLowerCase(), { id: c.id, capacity: c.capacity, currentCount: c._count.students }]));

    for (let i = 0; i < studentsData.length; i++) {
        const studentRow = studentsData[i];
        const rowIndex = i; // 0-based for processing, +1 for user-facing error reports

        try {
            await prisma.$transaction(async (tx) => {
                // --- Validate and Find/Create Parent ---
                if (!studentRow.parentUsername?.trim()) throw new Error("Parent username is required.");
                
                let parentProfile = await tx.parent.findFirst({
                    where: { username: studentRow.parentUsername, schoolId: actualSchoolId },
                    select: { id: true, authId: true }
                });
                let parentAuthId: string; // Will hold the Auth ID of the parent
                let parentId: string; // Will hold the Parent Profile ID

                if (parentProfile && parentProfile.authId) {
                    parentAuthId = parentProfile.authId;
                    parentId = parentProfile.id;
                } else { // Parent does not exist, create new Auth and Parent profile
                    // Username is essential for new parent Auth, email is optional
                    if (!studentRow.parentUsername?.trim()) {
                        throw new Error("Parent username is required for new parent creation.");
                    }
                    if (!studentRow.parentPassword || studentRow.parentPassword.length < 8) {
                        throw new Error("Parent password (min 8 chars) is required for new parent creation.");
                    }
                    // Parent email is now optional. If not provided, it will be undefined/null in Auth.

                const parentDataForValidation = {
                        username: studentRow.parentUsername,
                        password: studentRow.parentPassword, // Will be hashed
                        email: studentRow.parentEmail,
                    name: studentRow.parentFirstName,
                    surname: studentRow.parentLastName,
                    phone: studentRow.parentPhone,
                    address: studentRow.parentAddress,
                        // schoolId added during creation
                };
                const validatedParent = parentSchema.safeParse(parentDataForValidation);
                if (!validatedParent.success) {
                        throw new Error(`Parent validation: ${validatedParent.error.errors.map(e => e.message).join('; ')}`);
                }
                    const { password, ...newParentDetails } = validatedParent.data;
                    const hashedParentPassword = await hashPassword(password!);

                    const dataForParentAuthCreate = {
                        username: newParentDetails.username!,
                        email: newParentDetails.email && newParentDetails.email.trim() !== "" ? newParentDetails.email : undefined,
                        password: hashedParentPassword,
                        role: "parent" as const,
                        schoolId: actualSchoolId,
                    };
                    console.log("[bulkCreateStudents] Creating Parent Auth with data:", dataForParentAuthCreate);
                    const newAuth = await tx.auth.create({ data: dataForParentAuthCreate });
                    parentAuthId = newAuth.id;

                    const createdParentProfile = await tx.parent.create({
                        data: {
                            ...newParentDetails,
                            username: newParentDetails.username!, // from schema
                            email: newParentDetails.email && newParentDetails.email.trim() !== "" ? newParentDetails.email : null, // Handle empty string for Parent email
                            authId: parentAuthId,
                            schoolId: actualSchoolId,
                            // Ensure required fields like name/surname have defaults if not provided
                            name: newParentDetails.name || 'N/A',
                            surname: newParentDetails.surname || 'N/A',
                        },
                        select: {id: true }
                    });
                    parentId = createdParentProfile.id;
                }
                // --- Validate and Find Grade & Class ---
                if (!studentRow.gradeLevel?.trim()) throw new Error("Grade level is required for student.");
                const gradeId = gradeMap.get(studentRow.gradeLevel.toLowerCase());
                if (!gradeId) throw new Error(`Grade level "${studentRow.gradeLevel}" not found.`);

                if (!studentRow.className?.trim()) throw new Error("Class name is required for student.");
                const classInfo = classMap.get(studentRow.className.toLowerCase());
                if (!classInfo) throw new Error(`Class "${studentRow.className}" not found.`);
                if (classInfo.capacity <= classInfo.currentCount) {
                    throw new Error(`Class "${studentRow.className}" is full.`);
                 }

                // --- Create Student ---
                if (!studentRow.studentUsername?.trim()) throw new Error("Student username is required.");
                if (!studentRow.studentPassword || studentRow.studentPassword.length < 8) {
                    throw new Error("Student password (min 8 chars) is required.");
            }

                const studentDataForValidation = {
                username: studentRow.studentUsername,
                    password: studentRow.studentPassword, // will be hashed
                    email: studentRow.studentEmail, // for Auth and Student table
                name: studentRow.studentFirstName,
                surname: studentRow.studentLastName,
                phone: studentRow.studentPhone,
                address: studentRow.studentAddress,
                img: studentRow.studentImageURL,
                bloodType: studentRow.studentBloodType,
                    birthday: studentRow.studentBirthday ? new Date(studentRow.studentBirthday) : undefined,
                    sex: studentRow.studentSex?.toUpperCase(), // Match enum, ensure UserSex is string enum
                gradeId: gradeId,
                classId: classInfo.id,
                    parentId: parentId, // ID from parent profile
            };

                const validatedStudent = studentSchema.safeParse(studentDataForValidation);
                if (!validatedStudent.success) {
                    throw new Error(`Student validation: ${validatedStudent.error.errors.map(e => e.message).join('; ')}`);
             }
                const { password: studentPass, ...newStudentDetails } = validatedStudent.data;
                const hashedStudentPassword = await hashPassword(studentPass!);

                const dataForStudentAuthCreate = {
                    username: newStudentDetails.username!,
                    email: newStudentDetails.email && newStudentDetails.email.trim() !== "" ? newStudentDetails.email : undefined,
                    password: hashedStudentPassword,
                    role: "student" as const,
                    schoolId: actualSchoolId,
                };
                console.log("[bulkCreateStudents] Creating Student Auth with data:", dataForStudentAuthCreate);
                const newStudentAuth = await tx.auth.create({ data: dataForStudentAuthCreate });

                await tx.student.create({
                data: {
                        ...newStudentDetails,
                        email: newStudentDetails.email && newStudentDetails.email.trim() !== "" ? newStudentDetails.email : null, // Handle empty string for Student email
                        authId: newStudentAuth.id,
                        schoolId: actualSchoolId,
                        // Ensure required fields like name/surname have defaults if not provided
                        name: newStudentDetails.name || 'N/A',
                        surname: newStudentDetails.surname || 'N/A',
                        address: newStudentDetails.address || 'N/A',
                        bloodType: newStudentDetails.bloodType || 'UNKNOWN', // Default if not provided or invalid
                        sex: newStudentDetails.sex as any, // Cast to any if Zod validates against string enum
                },
            });

                classMap.get(studentRow.className.toLowerCase())!.currentCount++;
            successCount++;
            }); // End transaction for one student row
        } catch (error: any) {
            console.error(`Error processing student row ${rowIndex + 1} (Student: ${studentRow.studentUsername || 'N/A'}, Parent: ${studentRow.parentUsername || 'N/A'}):`, error);
            let message = error.message || "An unknown error occurred.";
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const target = error.meta?.target as string[] | string | undefined;
                let fieldDetails = Array.isArray(target) ? target.join(', ') : target;
                message = `Data conflict: A record with similar unique information (e.g., email, username) already exists. Details: ${fieldDetails}`;
            }
            errors.push({
                index: rowIndex + 1, 
                identifier: studentRow.studentUsername || studentRow.parentUsername,
                message: message
            });
        }
    }

    revalidatePath(`/schools/${actualSchoolId}/list/students`);
    revalidatePath(`/schools/${actualSchoolId}/list/parents`);
    revalidatePath(`/schools/${actualSchoolId}/list/classes`);

    return {
        successCount,
        errorCount: errors.length,
        errors,
    };
};

// ==========================================================================
// BULK TEACHER CREATION
// ==========================================================================
export const bulkCreateTeachers = async (
    currentState: BulkActionResult | null,
    teachersData: BulkTeacherInput[],
    schoolIdOverride?: string
): Promise<BulkActionResult> => {
    let actualSchoolId: string;
    try {
        actualSchoolId = schoolIdOverride || await getCurrentUserSchoolId();
        if (!await isAdminOfSchool(actualSchoolId)) {
            return { successCount: 0, errorCount: teachersData.length, errors: [{ index: -1, identifier: "System", message: "Unauthorized: Only admins can perform bulk teacher imports." }] };
        }
    } catch (authError: any) {
        return { successCount: 0, errorCount: teachersData.length, errors: [{ index: -1, identifier: "System", message: authError.message || "Authentication error." }] };
    }

    if (!teachersData || teachersData.length === 0) {
        return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: "No teacher data provided." }] };
    }

    // NEW: Subscription Check
    const activeSubscriptionDetails = await getActiveSchoolSubscription(actualSchoolId);
    if (!activeSubscriptionDetails) {
        return {
            successCount: 0,
            errorCount: teachersData.length, // All rows fail due to no active subscription
            errors: [{ index: -1, identifier: "System", message: "No active subscription found for the school. Please subscribe to a plan to add teachers." }]
        };
    }

    const { plan } = activeSubscriptionDetails;

    if (plan.maxTeachers !== null) {
        const currentTeacherCount = await prisma.teacher.count({ where: { schoolId: actualSchoolId } });
        const slotsAvailable = plan.maxTeachers - currentTeacherCount;
        if (teachersData.length > slotsAvailable) {
            return {
                successCount: 0,
                errorCount: teachersData.length,
                errors: [{
                    index: -1,
                    identifier: "System",
                    message: `Cannot add ${teachersData.length} teachers. Your current plan allows a maximum of ${plan.maxTeachers} teachers. You currently have ${currentTeacherCount} teachers, with ${slotsAvailable > 0 ? slotsAvailable : 0} slot(s) available.`
                }]
            };
        }
    }
    // END NEW: Subscription Check

    let successCount = 0;
    const errors: BulkActionResult['errors'] = [];

    const existingSubjects = await prisma.subject.findMany({ where: { schoolId: actualSchoolId }, select: { id: true, name: true } });
    const subjectMap = new Map(existingSubjects.map(s => [s.name.toLowerCase(), s.id]));

    for (let i = 0; i < teachersData.length; i++) {
        const teacherRow = teachersData[i];
        const rowIndex = i;

        try {
            await prisma.$transaction(async (tx) => {
                if (!teacherRow.teacherUsername?.trim()) throw new Error("Teacher username is required.");
                if (!teacherRow.teacherPassword || teacherRow.teacherPassword.length < 8) {
                    throw new Error("Teacher password (min 8 chars) is required.");
                }

            const subjectIdsToConnect: { id: number }[] = [];
            if (teacherRow.subjectNames) {
                const subjectNames = teacherRow.subjectNames.split(',').map(name => name.trim().toLowerCase()).filter(name => name);
                for (const name of subjectNames) {
                    const subjectId = subjectMap.get(name);
                    if (subjectId) {
                        subjectIdsToConnect.push({ id: subjectId });
                    } else {
                            throw new Error(`Subject "${name}" not found in this school.`);
                    }
                }
            }

                const teacherDataForValidation = {
                username: teacherRow.teacherUsername,
                password: teacherRow.teacherPassword,
                    email: teacherRow.teacherEmail, 
                name: teacherRow.teacherFirstName,
                surname: teacherRow.teacherLastName,
                phone: teacherRow.teacherPhone,
                address: teacherRow.teacherAddress,
                img: teacherRow.teacherImageURL,
                bloodType: teacherRow.teacherBloodType,
                    birthday: teacherRow.teacherBirthday ? new Date(teacherRow.teacherBirthday) : undefined,
                    sex: teacherRow.teacherSex?.toUpperCase(),
                    subjects: subjectIdsToConnect.map(s => String(s.id)) // Zod schema likely expects string IDs
            };

                const validatedTeacher = teacherSchema.safeParse(teacherDataForValidation);
                if (!validatedTeacher.success) {
                    throw new Error(`Teacher validation: ${validatedTeacher.error.errors.map(e => e.message).join('; ')}`);
                }
                const { password: teacherPass, subjects, ...newTeacherDetails } = validatedTeacher.data;
                const hashedTeacherPassword = await hashPassword(teacherPass!);

                const dataForTeacherAuthCreate = {
                    username: newTeacherDetails.username!,
                    email: newTeacherDetails.email && newTeacherDetails.email.trim() !== "" ? newTeacherDetails.email : undefined,
                    password: hashedTeacherPassword,
                    role: "teacher" as const,
                    schoolId: actualSchoolId,
                };
                console.log("[bulkCreateTeachers] Creating Teacher Auth with data:", dataForTeacherAuthCreate);
                const newTeacherAuth = await tx.auth.create({ data: dataForTeacherAuthCreate });
                
                await tx.teacher.create({
                data: {
                        ...newTeacherDetails,
                        username: newTeacherDetails.username!, // from schema
                        email: newTeacherDetails.email && newTeacherDetails.email.trim() !== "" ? newTeacherDetails.email : null, // Handle empty string for Teacher email
                        authId: newTeacherAuth.id,
                        schoolId: actualSchoolId,
                         // Ensure required fields like name/surname have defaults if not provided
                        name: newTeacherDetails.name || 'N/A',
                        surname: newTeacherDetails.surname || 'N/A',
                        bloodType: newTeacherDetails.bloodType || 'UNKNOWN',
                        sex: newTeacherDetails.sex as any, // Cast if UserSex is string enum
                    subjects: {
                            connect: subjectIdsToConnect
                    }
                },
            });
            successCount++;
            }); // End transaction for one teacher row
        } catch (error: any) {
            console.error(`Error processing teacher row ${rowIndex + 1} (Teacher: ${teacherRow.teacherUsername || 'N/A'}):`, error);
            let message = error.message || "An unknown error occurred.";
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const target = error.meta?.target as string[] | string | undefined;
                let fieldDetails = Array.isArray(target) ? target.join(', ') : target;
                message = `Data conflict: A record with similar unique information (e.g., email, username) already exists. Details: ${fieldDetails}`;
            }
            errors.push({
                index: rowIndex + 1,
                identifier: teacherRow.teacherUsername,
                message: message
            });
        }
    }

    revalidatePath(`/schools/${actualSchoolId}/list/teachers`);
    revalidatePath(`/schools/${actualSchoolId}/list/subjects`);

    return {
        successCount,
        errorCount: errors.length,
        errors,
    };
};

// ==========================================================================
// BULK RESULT CREATION
// ==========================================================================
export const bulkCreateResults = async (
    currentState: BulkActionResult | null,
    resultsData: BulkResultInput[],
    schoolIdOverride?: string
): Promise<BulkActionResult> => {
    let actualSchoolId: string;
    let authUser: AuthUser | null;

    try {
        actualSchoolId = schoolIdOverride || await getCurrentUserSchoolId();
        authUser = await getVerifiedAuthUser();
        if (!authUser) {
            return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: "Unauthorized: User not authenticated." }] };
    }
        if (authUser.schoolId !== actualSchoolId) {
            return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: "Unauthorized: User does not belong to this school." }] };
        }
        if (authUser.role !== 'admin' && authUser.role !== 'teacher') {
            return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: "Unauthorized: Only admins or teachers can perform this bulk import." }] };
    }
    } catch (authError: any) {
        return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: authError.message || "Authentication error." }] };
    }

    if (!resultsData || resultsData.length === 0) {
        return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: "No result data provided." }] };
    }

    let successCount = 0;
    const errors: BulkActionResult['errors'] = [];

    const existingStudents = await prisma.student.findMany({ 
        where: { schoolId: actualSchoolId }, 
        select: { id: true, username: true } 
    });
    const studentMap = new Map(existingStudents.map(s => [s.username.toLowerCase(), s.id]));

    let examMap: Map<string, number>;
    let assignmentMap: Map<string, number>;

    if (authUser.role === 'teacher') {
        const teacherProfile = await prisma.teacher.findFirst({where: {authId: authUser.id, schoolId: actualSchoolId}, select: {id: true}});
        if(!teacherProfile || !teacherProfile.id) { // Ensure teacherProfile and its ID exist
            return { successCount: 0, errorCount: 0, errors: [{ index: -1, identifier: "System", message: "Teacher profile not found for result import authorization." }] };
        }
        const [teacherExams, teacherAssignments] = await Promise.all([
            prisma.exam.findMany({
                where: { schoolId: actualSchoolId, lesson: { teacherId: teacherProfile.id } },
                select: { id: true, title: true }
            }),
            prisma.assignment.findMany({
                where: { schoolId: actualSchoolId, lesson: { teacherId: teacherProfile.id } },
                select: { id: true, title: true }
            }),
        ]);
        examMap = new Map(teacherExams.map(e => [e.title.toLowerCase(), e.id]));
        assignmentMap = new Map(teacherAssignments.map(a => [a.title.toLowerCase(), a.id]));
    } else { // Admin
        const [allExams, allAssignments] = await Promise.all([
            prisma.exam.findMany({ where: { schoolId: actualSchoolId }, select: { id: true, title: true } }),
            prisma.assignment.findMany({ where: { schoolId: actualSchoolId }, select: { id: true, title: true } }),
        ]);
        examMap = new Map(allExams.map(e => [e.title.toLowerCase(), e.id]));
        assignmentMap = new Map(allAssignments.map(a => [a.title.toLowerCase(), a.id]));
    }

    for (let i = 0; i < resultsData.length; i++) {
        const resultRow = resultsData[i];
        const rowIndex = i;
        try {
            await prisma.$transaction(async (tx) => {
                if (!resultRow.studentUsername?.trim()) throw new Error("Student username is missing.");
            if (resultRow.score === null || resultRow.score === undefined || resultRow.score.trim() === "") {
                    throw new Error("Score is missing.");
            }
            const parsedScore = parseFloat(resultRow.score);
                if (isNaN(parsedScore)) throw new Error(`Invalid score "${resultRow.score}". Must be a number.`);

            const hasExamTitle = resultRow.examTitle && resultRow.examTitle.trim() !== "";
            const hasAssignmentTitle = resultRow.assignmentTitle && resultRow.assignmentTitle.trim() !== "";
                if (hasExamTitle && hasAssignmentTitle) throw new Error("Provide exam OR assignment title, not both.");
                if (!hasExamTitle && !hasAssignmentTitle) throw new Error("Exam or assignment title is required.");

                const studentId = studentMap.get(resultRow.studentUsername.trim().toLowerCase());
                if (!studentId) throw new Error(`Student "${resultRow.studentUsername}" not found.`);

                let examId: number | undefined | null = null;
                let assignmentId: number | undefined | null = null;
            if (hasExamTitle) {
                examId = examMap.get(resultRow.examTitle!.trim().toLowerCase());
                    if (!examId) throw new Error(`Exam "${resultRow.examTitle}" not found or not authorized.`);
            } else if (hasAssignmentTitle) {
                assignmentId = assignmentMap.get(resultRow.assignmentTitle!.trim().toLowerCase());
                    if (!assignmentId) throw new Error(`Assignment "${resultRow.assignmentTitle}" not found or not authorized.`);
                }
                const resultDataForValidation = {
                    score: parsedScore,
                    studentId: studentId,
                    examId: examId,
                    assignmentId: assignmentId,
                    schoolId: actualSchoolId, // Add schoolId for validation if schema requires it
                };
                 const validatedResult = resultSchema.safeParse(resultDataForValidation);
                 if (!validatedResult.success) {
                    throw new Error(`Result validation: ${validatedResult.error.errors.map((e: ZodIssue) => e.message).join('; ')}`);
                 }

                await tx.result.create({
                data: {
                        score: validatedResult.data.score,
                        studentId: validatedResult.data.studentId!,
                        examId: validatedResult.data.examId,
                        assignmentId: validatedResult.data.assignmentId,
                        schoolId: actualSchoolId,
                },
            });
            successCount++;
            }); // End transaction
        } catch (error: any) {
            console.error(`Error processing result row ${rowIndex + 1} (Student: ${resultRow.studentUsername || 'N/A'}):`, error);
            let message = error.message || "An unknown error occurred.";
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                 message = `A result for student "${resultRow.studentUsername}" on this exam/assignment may already exist.`;
            }
            errors.push({
                index: rowIndex + 1,
                identifier: resultRow.studentUsername,
                message: message
            });
        }
    }

    revalidatePath(`/schools/${actualSchoolId}/list/results`);

    return {
        successCount,
        errorCount: errors.length,
        errors,
    };
};

// New action to update Admin profile and Auth details
export const updateAdmin = async (
  data: z.infer<typeof adminSchema>
): Promise<ActionState> => {
  try {
    const validatedFields = adminSchema.safeParse(data);
    if (!validatedFields.success) {
      return {
        success: false,
        error: true,
        message: "Invalid data: " + validatedFields.error.errors.map(e => e.message).join("; "),
      };
    }

    const { id, name, surname, phone, img, email, password, username } = validatedFields.data; // Added username

    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }

    // Fetch the admin profile and ensure it matches the authenticated user's authId
    const adminProfile = await prisma.admin.findUnique({
      where: { id: id, schoolId: authUser.schoolId! }, // Admin.id is CUID string
      select: { authId: true }
    });

    if (!adminProfile) {
      return { success: false, error: true, message: "Admin profile not found in this school." };
    }

    if (adminProfile.authId !== authUser.id) {
      return { success: false, error: true, message: "Forbidden: You can only update your own admin profile." };
    }
    
    const currentAuthRecord = await prisma.auth.findUnique({ where: { id: authUser.id } });
    if (!currentAuthRecord) {
        return { success: false, error: true, message: "Authentication record not found." };
    }

    // Prepare updates for Auth table
    const authUpdates: Partial<Prisma.AuthUpdateInput> = {};
    if (password) {
      authUpdates.password = await hashPassword(password);
    }

    let newEmailForAuth: string | undefined | null = email;
    if (newEmailForAuth === "") newEmailForAuth = undefined; // Treat empty string as intent to clear/make null if schema allows
                                                              // or keep current if profile email is not source of truth for Auth

    // Only update Auth.email if it's provided and different
    // Auth.email needs to be `undefined` to store NULL for unique constraint if empty
    if (newEmailForAuth !== undefined && newEmailForAuth !== currentAuthRecord.email) {
        authUpdates.email = newEmailForAuth; // newEmailForAuth is already string or undefined
    } else if (newEmailForAuth === undefined && currentAuthRecord.email !== null) {
        // If form email is empty (cleared), and DB email was not null, set to null (undefined for prisma)
        authUpdates.email = undefined;
    }


    await prisma.$transaction(async (tx) => {
      // Update Auth record if there are changes
      if (Object.keys(authUpdates).length > 0) {
        await tx.auth.update({
          where: { id: authUser.id },
          data: authUpdates,
        });
      }

      // Prepare Admin profile updates
      const adminProfileUpdates: Partial<Prisma.AdminUpdateInput> = {
        name: name || undefined,
        surname: surname || undefined,
        phone: phone || null,
        img: img || null,
      };

      // Only add username to updates if it's provided
      if (username && username.trim() !== "") {
        adminProfileUpdates.username = username;
      }

      // Update Admin profile details if there are changes
      if (Object.keys(adminProfileUpdates).length > 0) {
        await tx.admin.update({
          where: {
            id: id,
            schoolId: authUser.schoolId!, // Ensure school context
          },
          data: adminProfileUpdates, // Use the prepared updates object
        });
      }
    });

    // Revalidate the profile page path
    // Ensure schoolId and authId are correctly interpolated
    if (authUser.schoolId && authUser.id) {
         revalidatePath(`/schools/${authUser.schoolId}/profile/${authUser.id}`);
    }
    revalidatePath(`/schools/${authUser.schoolId}/list/admins`); // If there's an admin list page


    return { success: true, error: false, message: "Admin profile updated successfully." };

  } catch (err: any) {
    console.error("Error updating admin:", err);
    let errMsg = "Failed to update admin profile.";
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const target = err.meta?.target as string[] | undefined;
        if (target && target.includes('email') && (target.includes('Auth_email_key') || target.includes('auth_email_key'))) {
          errMsg = "This email address is already in use by another account.";
        } else if (target && target.includes('username') && (target.includes('Admin_username_key') || target.includes('admin_username_key'))) {
          errMsg = "This profile username is already in use.";
        } else {
          errMsg = "A unique constraint was violated (e.g., username or email already taken).";
        }
      }
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const getAnnouncements = async (schoolId: string, userRole?: string, userClassId?: number | null) => {
  if (!schoolId) {
    // This case should ideally be prevented by the caller, 
    // but as a safeguard:
    console.error("getAnnouncements: schoolId was not provided.");
    return []; // Or throw new Error("School ID is required to fetch announcements.");
  }

  try {
    const whereClause: Prisma.AnnouncementWhereInput = {
      schoolId: schoolId,
    };

    // Example of role-based filtering if needed in the future:
    // if (userRole === 'student' && userClassId) {
    //   whereClause.OR = [
    //     { classId: null }, // School-wide announcements
    //     { classId: userClassId } // Announcements for the student's class
    //   ];
    // } else if (userRole === 'teacher') {
    //   // Teachers might see school-wide and announcements for classes they teach (more complex query needed here)
    //   // For simplicity, admins/teachers currently see all for the school via this action.
    // }

    const announcements = await prisma.announcement.findMany({
      where: whereClause,
      include: {
        class: {
          select: { name: true }
        } // Include class name if announcement is class-specific
      },
      orderBy: {
        createdAt: 'desc' // Assuming 'createdAt' field exists and is desired for sorting
      },
      // take: 20, // Optional: limit the number of announcements fetched initially
    });
    return announcements;
  } catch (error) {
    console.error("Error fetching announcements:", error);
    // Depending on how you want to handle errors client-side:
    // return []; // Return empty array on error
    throw new Error("Failed to fetch announcements due to a server error."); // Or throw an error
  }
};

// Helper function to check for overlapping availability slots
async function checkOverlappingAvailability(
    teacherId: string,
    schoolId: string,
    dayOfWeek: Day,
    startTime: Date,
    endTime: Date,
    excludeAvailabilityId?: string 
): Promise<boolean> {
    const whereClause: Prisma.TeacherAvailabilityWhereInput = { // Use Prisma type
        teacherId,
        schoolId,
        dayOfWeek,
        id: excludeAvailabilityId ? { not: excludeAvailabilityId } : undefined,
        startTime: {
            lt: endTime,
        },
        endTime: {
            gt: startTime,
        },
    };

    const overlappingSlot = await prisma.teacherAvailability.findFirst({
        where: whereClause,
        select: { id: true }
    });
    return !!overlappingSlot;
}

export const createTeacherAvailability = async (
  currentState: ActionState, // Make sure ActionState is defined or imported
  data: TeacherAvailabilitySchema
): Promise<ActionState> => {
  try {
    const authUser = await getVerifiedAuthUser(); // Ensure this function is available
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }

    let teacherIdToUse = "";
    // Assuming authUser.id is the Teacher CUID for a logged-in teacher.
    // This needs to be consistent with how getVerifiedAuthUser populates the teacher's ID.
    if (authUser.role === 'teacher') {
        // if (!authUser.id) { // Or check for a specific teacher profile nested object if applicable
        // return { success: false, error: true, message: "Teacher profile not found for authenticated user." };
        // }
        // teacherIdToUse = authUser.id; 
        if (!authUser.profileId) { // Check for profileId for teachers
            return { success: false, error: true, message: "Teacher profile ID not found for authenticated user." };
        }
        teacherIdToUse = authUser.profileId; // Use profileId for teachers
    } else {
        // Allowing admin to specify teacherId if TeacherAvailabilitySchema includes it
        // if (data.teacherId) { teacherIdToUse = data.teacherId } else ...
        return { success: false, error: true, message: "Only teachers can create their own availability currently." };
    }
    
    const schoolId = authUser.schoolId;
    if (!schoolId) {
         return { success: false, error: true, message: "User not associated with a school." };
    }

    const startTimeDate = convertToDateTime(data.dayOfWeek, data.startTime);
    const endTimeDate = convertToDateTime(data.dayOfWeek, data.endTime);

    if (endTimeDate <= startTimeDate) {
      return { success: false, error: true, message: "End time must be after start time." };
    }

    const isOverlapping = await checkOverlappingAvailability(
        teacherIdToUse,
        schoolId,
        data.dayOfWeek,
        startTimeDate,
        endTimeDate
    );

    if (isOverlapping) {
        return { 
            success: false, 
            error: true, 
            message: "This availability slot overlaps with an existing one for the selected day and time." 
        };
    }

    await prisma.teacherAvailability.create({
      data: {
        dayOfWeek: data.dayOfWeek,
        startTime: startTimeDate,
        endTime: endTimeDate,
        isAvailable: false, // Hardcoded to false
        notes: data.notes,
        teacherId: teacherIdToUse, 
        schoolId: schoolId,
      },
    });

    revalidatePath(`/schools/${schoolId}/teacher/availability`); 
    return { success: true, error: false, message: "Availability created successfully." };
  } catch (err: any) {
    console.error("Error creating teacher availability:", err);
    let errMsg = "Failed to create teacher availability.";
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        errMsg = "An availability slot with this exact day and start time already exists for this teacher.";
    } else if (err instanceof Error) {
        errMsg = err.message;
    }
    return { success: false, error: true, message: errMsg };
  }
};

export const getTeacherAvailability = async (teacherId: string, schoolIdFromParam: string) => {
  // schoolIdFromParam is the school context from URL, authUser.schoolId is from logged-in user
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      // Handle as per app's convention: throw error or return specific response
      console.error("getTeacherAvailability: User not authenticated.");
      return []; // Or throw new Error("User not authenticated.");
    }

    // Authorization: 
    // 1. Teacher can get their own availability.
    // 2. Admin of THE SAME school can get any teacher's availability from that school.
    if (authUser.schoolId !== schoolIdFromParam) {
        console.error("getTeacherAvailability: User school does not match parameter school.");
        return []; // Or throw new Error("User not authorized for this school.");
    }

    // if (authUser.role === 'teacher' && authUser.id !== teacherId) { // OLD check comparing Auth.id to Teacher.id
    if (authUser.role === 'teacher' && authUser.profileId !== teacherId) { // CORRECTED check: Compare Teacher.id (profileId) to Teacher.id (teacherId param)
        console.error("getTeacherAvailability: Teacher trying to access another teacher's availability. Auth Profile ID: ", authUser.profileId, "Param teacherId:", teacherId);
        return []; // Or throw new Error("Unauthorized to view this teacher's availability.");
    }
    // If authUser.role is 'admin', they are authorized for their schoolId (schoolIdFromParam).

    const availabilitySlots = await prisma.teacherAvailability.findMany({
      where: {
        teacherId: teacherId,
        schoolId: schoolIdFromParam, // Query by the schoolId from param
      },
      orderBy: [
        // Prisma sorts enums alphabetically by default. If a specific Mon-Sun order is needed,
        // it's often best done client-side after fetching, or by adding a sortOrder field to Day enum.
        { dayOfWeek: 'asc' }, 
        { startTime: 'asc' },
      ],
    });
    
    // To ensure specific Mon-Sun sort order if 'asc' on enum string is not desired:
    // const daySortOrder = [Day.MONDAY, Day.TUESDAY, Day.WEDNESDAY, Day.THURSDAY, Day.FRIDAY, Day.SATURDAY, Day.SUNDAY];
    // availabilitySlots.sort((a, b) => {
    //    const dayAIndex = daySortOrder.indexOf(a.dayOfWeek);
    //    const dayBIndex = daySortOrder.indexOf(b.dayOfWeek);
    //    if (dayAIndex !== dayBIndex) return dayAIndex - dayBIndex;
    //    return a.startTime.getTime() - b.startTime.getTime();
    // });

    return availabilitySlots; // Return full objects, formatting can be done in component or with a mapper if needed

  } catch (error: any) {
    console.error("Error fetching teacher availability:", error.message);
    return []; 
  }
};

export const getTeacherAvailabilityForDay = async (teacherId: string, dayOfWeek: Day, schoolIdFromParam: string) => {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      console.error("getTeacherAvailabilityForDay: User not authenticated.");
      return [];
    }

    if (authUser.schoolId !== schoolIdFromParam) {
      console.error("getTeacherAvailabilityForDay: User school does not match parameter school.");
      return [];
    }

    // Admin can fetch, or teacher can fetch their own for a specific day.
    // The authorization check is primarily that the user belongs to the school.
    // Specific teacher check for "is this your own availability" is less critical here
    // if an admin is the primary consumer for this specific-day fetch.

    const availabilitySlots = await prisma.teacherAvailability.findMany({
      where: {
        teacherId: teacherId,
        schoolId: schoolIdFromParam,
        dayOfWeek: dayOfWeek,
      },
      orderBy: [
        { startTime: 'asc' },
      ],
    });
    return availabilitySlots;
  } catch (error: any) {
    console.error("Error fetching teacher availability for day:", error.message);
    return [];
  }
};

// Placeholder for updateTeacherAvailability
export const updateTeacherAvailability = async (
  currentState: ActionState,
  data: TeacherAvailabilitySchema & { id: string } // Ensure ID is present for updates
): Promise<ActionState> => {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }

    const schoolId = authUser.schoolId;
    if (!schoolId) {
         return { success: false, error: true, message: "User not associated with a school." };
    }
    
    let teacherIdToUse = "";
     if (authUser.role === 'teacher') {
        // if (!authUser.id) {
        if (!authUser.profileId) { // <--- MODIFIED: Check for profileId
             return { success: false, error: true, message: "Teacher profile ID not found for authenticated user." };
        }
        // teacherIdToUse = authUser.id;
        teacherIdToUse = authUser.profileId; // <--- MODIFIED: Use profileId
    } else {
        // Admin case - potentially allow updating other's availability if teacherId is in `data`
        // For now, sticking to teacher editing their own.
        return { success: false, error: true, message: "Only teachers can update their own availability currently." };
    }

    const availabilityId = data.id;
    const existingSlot = await prisma.teacherAvailability.findUnique({
        where: { id: availabilityId, schoolId: schoolId }
    });

    if (!existingSlot) {
        return { success: false, error: true, message: "Availability slot not found." };
    }
    // Ensure teacher is updating their own slot
    if (existingSlot.teacherId !== teacherIdToUse) {
        return { success: false, error: true, message: "Unauthorized to update this availability slot." };
    }

    const startTimeDate = convertToDateTime(data.dayOfWeek, data.startTime);
    const endTimeDate = convertToDateTime(data.dayOfWeek, data.endTime);

    if (endTimeDate <= startTimeDate) {
      return { success: false, error: true, message: "End time must be after start time." };
    }

    const isOverlapping = await checkOverlappingAvailability(
        teacherIdToUse,
        schoolId,
        data.dayOfWeek,
        startTimeDate,
        endTimeDate,
        availabilityId // Exclude current slot from overlap check
    );

    if (isOverlapping) {
        return { 
            success: false, 
            error: true, 
            message: "This availability slot overlaps with an existing one for the selected day and time." 
        };
    }

    await prisma.teacherAvailability.update({
        where: { id: availabilityId, schoolId: schoolId },
        data: {
            dayOfWeek: data.dayOfWeek,
            startTime: startTimeDate,
            endTime: endTimeDate,
            isAvailable: false, // Hardcoded to false
            notes: data.notes,
        }
    });

    revalidatePath(`/schools/${schoolId}/teacher/availability`);
    return { success: true, error: false, message: "Availability updated successfully." };

  } catch (err: any) {
    console.error("Error updating teacher availability:", err);
    let errMsg = "Failed to update teacher availability.";
     if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') { // Though P2002 might be less likely on update unless unique fields change to conflict
        errMsg = "Update resulted in a conflict with an existing availability slot.";
    } else if (err instanceof Error) {
        errMsg = err.message;
    }
    return { success: false, error: true, message: errMsg };
  }
};


export const deleteTeacherAvailability = async (
  currentState: ActionState,
  formData: FormData // Or accept an ID directly: { id: string }
): Promise<ActionState> => {
  const availabilityId = formData.get("id") as string;
  // Basic validation for id if needed, though Prisma will fail if not found/invalid cuid
  if (!availabilityId || typeof availabilityId !== 'string') {
      return { success: false, error: true, message: "Invalid Availability ID." };
  }

  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }
    const schoolId = authUser.schoolId;
     if (!schoolId) {
         return { success: false, error: true, message: "User not associated with a school." };
    }

    let teacherIdToUse = "";
     if (authUser.role === 'teacher') {
         if (!authUser.id) {
             return { success: false, error: true, message: "Teacher profile not found." };
        }
        teacherIdToUse = authUser.id;
    } else {
        return { success: false, error: true, message: "Only teachers can delete their own availability currently." };
    }
    
    const existingSlot = await prisma.teacherAvailability.findUnique({
        where: { id: availabilityId, schoolId: schoolId }
    });

    if (!existingSlot) {
        return { success: false, error: true, message: "Availability slot not found." };
    }
    if (existingSlot.teacherId !== teacherIdToUse) {
         return { success: false, error: true, message: "Unauthorized to delete this availability slot." };
    }

    await prisma.teacherAvailability.delete({
      where: { 
        id: availabilityId,
        // Adding schoolId and teacherId here for extra safety, though ID should be unique
        schoolId: schoolId, 
        teacherId: teacherIdToUse 
      },
    });

    revalidatePath(`/schools/${schoolId}/teacher/availability`);
    return { success: true, error: false, message: "Availability deleted successfully." };
  } catch (err: any) {
    console.error("Error deleting teacher availability:", err);
    // Prisma's P2025 Record to delete does not exist.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return { success: false, error: true, message: "Availability slot not found or already deleted." };
    }
    return { success: false, error: true, message: err instanceof Error ? err.message : "Failed to delete availability." };
  }
};

export const createScheduleChangeRequest = async (
  currentState: ActionState,
  data: ScheduleChangeRequestSchema
): Promise<ActionState> => {
  console.log("[ACTION createScheduleChangeRequest] Invoked. Received data:", JSON.stringify(data, null, 2));
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      console.error("[ACTION createScheduleChangeRequest] Error: User not authenticated.");
      return { success: false, error: true, message: "User not authenticated." };
    }
    if (authUser.role !== 'teacher') {
      console.error("[ACTION createScheduleChangeRequest] Error: User is not a teacher.");
      return { success: false, error: true, message: "Only teachers can submit change requests." };
    }
    if (!authUser.profileId) {
      console.error("[ACTION createScheduleChangeRequest] Error: Teacher profile ID not found.");
      return { success: false, error: true, message: "Teacher profile ID not found for authenticated user." };
    }
    if (!authUser.schoolId) {
      console.error("[ACTION createScheduleChangeRequest] Error: User not associated with a school.");
      return { success: false, error: true, message: "User not associated with a school." };
    }

    const schoolId = authUser.schoolId;
    const requestingTeacherId = authUser.profileId;

    console.log(`[ACTION createScheduleChangeRequest] Requesting Teacher ID: ${requestingTeacherId}, School ID: ${schoolId}, Lesson ID: ${data.lessonId}`);

    const lesson = await prisma.lesson.findUnique({
      where: { id: data.lessonId, schoolId: schoolId },
      select: { id: true, teacherId: true }
    });

    if (!lesson) {
      console.error(`[ACTION createScheduleChangeRequest] Error: Lesson with ID ${data.lessonId} not found in school ${schoolId}.`);
      return { success: false, error: true, message: "Lesson not found in this school." };
    }
    console.log(`[ACTION createScheduleChangeRequest] Found lesson. Lesson Teacher ID: ${lesson.teacherId}`);


    let proposedStartTimeDate: Date | null = null;
    let proposedEndTimeDate: Date | null = null;

    if (data.requestedChangeType === PrismaScheduleChangeType.TIME_CHANGE) { 
      console.log("[ACTION createScheduleChangeRequest] Processing TIME_CHANGE request.");
      if (!data.proposedDay || !data.proposedStartTime || !data.proposedEndTime) {
        console.error("[ACTION createScheduleChangeRequest] Error: TIME_CHANGE missing proposedDay, proposedStartTime, or proposedEndTime.");
        return { success: false, error: true, message: "Proposed day, start time, and end time are required for a time change." };
      }
      proposedStartTimeDate = convertToDateTime(data.proposedDay, data.proposedStartTime);
      proposedEndTimeDate = convertToDateTime(data.proposedDay, data.proposedEndTime);
      if (proposedEndTimeDate <= proposedStartTimeDate) {
        console.error("[ACTION createScheduleChangeRequest] Error: TIME_CHANGE proposed end time is not after start time.");
        return { success: false, error: true, message: "Proposed end time must be after start time." };
      }
      console.log("[ACTION createScheduleChangeRequest] TIME_CHANGE details processed.");
    } else if (data.requestedChangeType === PrismaScheduleChangeType.SWAP) { 
      console.log("[ACTION createScheduleChangeRequest] Processing SWAP request.");
      console.log("[ACTION createScheduleChangeRequest] SWAP data.proposedSwapTeacherId:", data.proposedSwapTeacherId);
      if (!data.proposedSwapTeacherId) {
        console.error("[ACTION createScheduleChangeRequest] Error: SWAP type, but proposedSwapTeacherId is missing.");
        return { success: false, error: true, message: "A teacher to swap with must be selected for a SWAP request." };
      }

      // Crucial check: Teacher can only swap their own lessons
      if (lesson.teacherId !== requestingTeacherId) {
          console.error(`[ACTION createScheduleChangeRequest] Error: SWAP authorization failed. Requesting teacher ${requestingTeacherId} is not the owner of lesson ${lesson.id} (owner: ${lesson.teacherId}).`);
          return { success: false, error: true, message: "You can only request swaps for your own lessons." };
      }

      const swapTeacher = await prisma.teacher.findUnique({
        where: { id: data.proposedSwapTeacherId, schoolId: schoolId }
      });
      if (!swapTeacher) {
        console.error(`[ACTION createScheduleChangeRequest] Error: SWAP teacher with ID ${data.proposedSwapTeacherId} not found in school ${schoolId}.`);
        return { success: false, error: true, message: "Proposed swap teacher not found in this school." };
      }
      if (swapTeacher.id === requestingTeacherId) {
        console.error("[ACTION createScheduleChangeRequest] Error: SWAP teacher cannot be the same as requesting teacher.");
        return { success: false, error: true, message: "Cannot propose a swap with yourself." };
      }
      console.log(`[ACTION createScheduleChangeRequest] SWAP details processed. Swap Teacher ID: ${swapTeacher.id}`);
    }

    const dataToCreate = {
      requestingTeacherId: requestingTeacherId,
      lessonId: data.lessonId,
      requestedChangeType: data.requestedChangeType as PrismaScheduleChangeType, 
      proposedStartTime: proposedStartTimeDate,
      proposedEndTime: proposedEndTimeDate,
      proposedDay: data.requestedChangeType === PrismaScheduleChangeType.TIME_CHANGE ? data.proposedDay : null,
      proposedSwapTeacherId: data.requestedChangeType === PrismaScheduleChangeType.SWAP ? data.proposedSwapTeacherId : null,
      reason: data.reason,
      status: PrismaRequestStatus.PENDING, 
      schoolId: schoolId,
    };
    console.log("[ACTION createScheduleChangeRequest] Data prepared for Prisma create:", JSON.stringify(dataToCreate, null, 2));

    await prisma.scheduleChangeRequest.create({
      data: dataToCreate
    });
    console.log("[ACTION createScheduleChangeRequest] Prisma create successful. ScheduleChangeRequest created in DB.");

    revalidatePath(`/schools/${schoolId}/teacher/my-schedule`); 
    revalidatePath(`/schools/${schoolId}/teacher/my-requests`); 
    revalidatePath(`/schools/${schoolId}/admin/schedule-requests`);
    console.log("[ACTION createScheduleChangeRequest] Paths revalidated. Returning success.");

    return { success: true, error: false, message: "Schedule change request submitted successfully." };

  } catch (err: any) {
    console.error("[ACTION createScheduleChangeRequest] Error caught in main try-catch block:", err); 
    let errMsg = "Failed to submit schedule change request due to an unexpected error.";
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      errMsg = "A similar pending request for this lesson might already exist, or another unique constraint was violated.";
    } else if (err instanceof z.ZodError) {
      errMsg = "Server-side validation error: " + err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      console.error("[ACTION createScheduleChangeRequest] ZodError on server:", JSON.stringify(err.errors, null, 2));
    } else if (err instanceof Error) {
      errMsg = err.message;
    }
    return { success: false, error: true, message: errMsg };
  }
};

// NEW ACTION: Get lessons for a specific teacher
export const getTeacherLessons = async (teacherIdToFetch?: string, schoolIdFromParam?: string) => {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      console.error("getTeacherLessons: User not authenticated.");
      return []; 
    }

    const schoolId = schoolIdFromParam || authUser.schoolId;
    if (!schoolId) {
      console.error("getTeacherLessons: School ID not available.");
      return [];
    }

    let targetTeacherId = teacherIdToFetch;

    // If a teacher is fetching, they can only fetch their own lessons.
    // Admin might fetch for a specific teacher (if teacherIdToFetch is provided by admin UI).
    if (authUser.role === 'teacher') {
      if (!authUser.profileId) {
        console.error("getTeacherLessons: Teacher profile ID not found for authenticated user.");
        return [];
      }
      // If teacherIdToFetch is provided but doesn't match logged-in teacher's profile, deny.
      if (teacherIdToFetch && teacherIdToFetch !== authUser.profileId) {
        console.error("getTeacherLessons: Teacher trying to access another teacher's lessons.");
        return [];
      }
      targetTeacherId = authUser.profileId; // Teacher fetches their own lessons
    } else if (authUser.role === 'admin') {
      if (!teacherIdToFetch) {
        // Admin must specify which teacher's lessons to fetch.
        // Or, we could decide admins fetch ALL lessons if no teacherIdToFetch, but that's a different use case.
        console.warn("getTeacherLessons: Admin did not specify a teacher ID. Returning no lessons.");
        return [];
      }
      // Ensure admin is accessing within their own school
      if (authUser.schoolId !== schoolId) {
        console.error("getTeacherLessons: Admin school mismatch.");
        return [];
      }
    } else {
      // Other roles are not authorized
      console.error("getTeacherLessons: Unauthorized role.");
      return [];
    }

    if (!targetTeacherId) {
      console.error("getTeacherLessons: Target teacher ID could not be determined.");
      return [];
    }

    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: targetTeacherId,
        schoolId: schoolId,
      },
      include: {
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        // teacher: { select: { id: true, name: true, surname: true } } // Already fetching for this teacher
      },
      orderBy: [
        // Add a more robust sorting, e.g., by day then by start time
        // This requires day to be consistently stored or mapped to a sortable value.
        // For now, sort by startTime as a general default.
        { startTime: 'asc' },
      ],
    });

    return lessons;

  } catch (error: any) {
    console.error("Error fetching teacher lessons:", error.message);
    return []; 
  }
};

// NEW ACTION: Get schedule change requests for a specific teacher
export const getScheduleChangeRequestsForTeacher = async (schoolIdFromParam?: string) => {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      console.error("getScheduleChangeRequestsForTeacher: User not authenticated.");
      return [];
    }
    if (authUser.role !== 'teacher') {
      console.error("getScheduleChangeRequestsForTeacher: User is not a teacher.");
      return [];
    }
    if (!authUser.profileId) {
      console.error("getScheduleChangeRequestsForTeacher: Teacher profile ID not found.");
      return [];
    }

    const schoolId = schoolIdFromParam || authUser.schoolId;
    if (!schoolId) {
      console.error("getScheduleChangeRequestsForTeacher: School ID not available.");
      return [];
    }
    // Ensure the teacher is querying for requests within their own school context
    if (authUser.schoolId !== schoolId) {
        console.error("getScheduleChangeRequestsForTeacher: School ID mismatch.");
        return [];
    }

    const requests = await prisma.scheduleChangeRequest.findMany({
      where: {
        requestingTeacherId: authUser.profileId,
        schoolId: schoolId,
      },
      include: {
        lesson: {
          select: {
            id: true,
            name: true,
            day: true,
            startTime: true,
            endTime: true,
            subject: { select: { name: true } },
            class: { select: { name: true } },
          }
        },
        proposedSwapTeacher: { // Include details of the teacher proposed for a swap
          select: { id: true, name: true, surname: true }
        },
        // requestingTeacher is the current user, so no need to include it explicitly again unless for other details
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    // Serialize dates before sending to client component
    return JSON.parse(JSON.stringify(requests));

  } catch (error: any) {
    console.error("Error fetching schedule change requests for teacher:", error.message);
    return [];
  }
};

// NEW ACTION: Cancel a schedule change request (by the requesting teacher)
export const cancelScheduleChangeRequest = async (currentState: ActionState, requestId: string): Promise<ActionState> => {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }
    if (authUser.role !== 'teacher') {
      return { success: false, error: true, message: "Only teachers can cancel their requests." };
    }
    if (!authUser.profileId) {
      return { success: false, error: true, message: "Teacher profile ID not found." };
    }
    if (!authUser.schoolId) {
        return { success: false, error: true, message: "User not associated with a school." };
    }

    const request = await prisma.scheduleChangeRequest.findUnique({
      where: { id: requestId, schoolId: authUser.schoolId }, // Ensure request is within the teacher's school
      select: { id: true, requestingTeacherId: true, status: true }
    });

    if (!request) {
      return { success: false, error: true, message: "Request not found." };
    }

    if (request.requestingTeacherId !== authUser.profileId) {
      return { success: false, error: true, message: "Unauthorized: You can only cancel your own requests." };
    }

    if (request.status !== PrismaRequestStatus.PENDING) {
      return { success: false, error: true, message: `Cannot cancel request with status: ${request.status}. Only PENDING requests can be canceled.` };
    }

    await prisma.scheduleChangeRequest.update({
      where: { id: requestId }, // ID is unique, schoolId/teacherId checks done above
      data: {
        status: PrismaRequestStatus.CANCELED,
      }
    });

    // Revalidate paths where requests are shown
    revalidatePath(`/schools/${authUser.schoolId}/teacher/my-requests`);
    revalidatePath(`/schools/${authUser.schoolId}/admin/schedule-requests`); // Admin view might also need revalidation

    return { success: true, error: false, message: "Schedule change request canceled successfully." };

  } catch (err: any) {
    console.error("Error canceling schedule change request:", err);
    let errMsg = "Failed to cancel schedule change request.";
    if (err instanceof Error) {
      errMsg = err.message;
    }
    return { success: false, error: true, message: errMsg };
  }
};

// NEW ACTION: Get schedule change requests for an Admin
export const getScheduleChangeRequestsForAdmin = async (schoolIdFromParam?: string) => {
  console.log(`[ACTION getScheduleChangeRequestsForAdmin] Initiated for school: ${schoolIdFromParam}`);
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      console.error("[ACTION getScheduleChangeRequestsForAdmin] Error: User not authenticated.");
      return []; // Or throw an error appropriate for your error handling
    }

    const schoolId = schoolIdFromParam || authUser.schoolId;
    if (!schoolId) {
      console.error("[ACTION getScheduleChangeRequestsForAdmin] Error: School ID not available.");
      return [];
    }

    // Authorization: Ensure the user is an admin of this school
    if (authUser.role !== 'admin' || authUser.schoolId !== schoolId) {
      console.error(`[ACTION getScheduleChangeRequestsForAdmin] Error: User ${authUser.id} (role: ${authUser.role}) is not authorized for school ${schoolId}.`);
      return []; // Or throw an authorization error
    }
    console.log(`[ACTION getScheduleChangeRequestsForAdmin] User ${authUser.id} is an admin for school ${schoolId}. Fetching PENDING requests.`);

    const requests = await prisma.scheduleChangeRequest.findMany({
      where: {
        schoolId: schoolId,
        status: PrismaRequestStatus.PENDING, // Fetch only PENDING requests
      },
      include: {
        lesson: {
          include: {
            subject: { select: { id: true, name: true } },
            class: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true, surname: true } }, // Original teacher of the lesson
          }
        },
        requestingTeacher: {
          select: { id: true, name: true, surname: true, email: true }
        },
        proposedSwapTeacher: {
          select: { id: true, name: true, surname: true, email: true }
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`[ACTION getScheduleChangeRequestsForAdmin] Found ${requests.length} PENDING requests.`);
    // Serialize dates before sending to client component, as Prisma dates are not directly serializable
    return JSON.parse(JSON.stringify(requests));

  } catch (error: any) {
    console.error("[ACTION getScheduleChangeRequestsForAdmin] Error fetching schedule change requests for admin:", error.message);
    // Consider the implications of error handling, e.g., re-throwing or returning a specific error structure
    return []; // Return empty array on error for now
  }
};

export const rejectScheduleChangeRequest = async (
  currentState: ActionState, 
  payload: { requestId: string; adminNotes: string; }
): Promise<ActionState> => {
  const { requestId, adminNotes } = payload;
  console.log(`[ACTION rejectScheduleChangeRequest] Initiated for request ID: ${requestId}`);
  if (!adminNotes || adminNotes.trim() === "") {
    console.error("[ACTION rejectScheduleChangeRequest] Error: Admin notes are required for rejection.");
    return { success: false, error: true, message: "Admin notes are required to reject a request." };
  }

  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      console.error("[ACTION rejectScheduleChangeRequest] Error: User not authenticated.");
      return { success: false, error: true, message: "User not authenticated." };
    }
    if (!authUser.schoolId) {
      console.error("[ACTION rejectScheduleChangeRequest] Error: Authenticated user not associated with a school.");
      return { success: false, error: true, message: "User not associated with a school." };
    }
    if (authUser.role !== 'admin') {
      console.error("[ACTION rejectScheduleChangeRequest] Error: User is not an admin.");
      return { success: false, error: true, message: "Only admins can reject requests." };
    }

    const schoolId = authUser.schoolId;

    const requestToUpdate = await prisma.scheduleChangeRequest.findUnique({
      where: { id: requestId, schoolId: schoolId },
      select: { id: true, status: true }
    });

    if (!requestToUpdate) {
      console.error(`[ACTION rejectScheduleChangeRequest] Error: Request with ID ${requestId} not found in school ${schoolId}.`);
      return { success: false, error: true, message: "Schedule change request not found." };
    }

    if (requestToUpdate.status !== PrismaRequestStatus.PENDING) {
      console.warn(`[ACTION rejectScheduleChangeRequest] Warning: Request ${requestId} is not in PENDING state (current: ${requestToUpdate.status}).`);
      return { 
        success: false, 
        error: true, 
        message: `Only PENDING requests can be rejected. This request is currently ${requestToUpdate.status}.` 
      };
    }

    console.log(`[ACTION rejectScheduleChangeRequest] Rejecting request ${requestId} with notes.`);
    await prisma.scheduleChangeRequest.update({
      where: { id: requestId }, // schoolId already implicitly checked by fetching requestToUpdate with schoolId
      data: {
        status: PrismaRequestStatus.REJECTED,
        adminNotes: adminNotes.trim(),
        // approvedByUserId: authUser.id, // Or a specific admin profile ID if you link Admin profile to Auth
      },
    });

    console.log(`[ACTION rejectScheduleChangeRequest] Request ${requestId} successfully rejected.`);
    // Revalidate paths where requests are shown
    revalidatePath(`/schools/${schoolId}/admin/schedule-requests`);
    revalidatePath(`/schools/${schoolId}/teacher/my-requests`); // Teacher also needs to see the update

    return { success: true, error: false, message: "Schedule change request has been rejected." };

  } catch (err: any) {
    console.error("[ACTION rejectScheduleChangeRequest] Error caught:", err);
    return { success: false, error: true, message: err.message || "Failed to reject schedule change request due to an unexpected error." };
  }
};

export const approveScheduleChangeRequest = async (
  currentState: ActionState, 
  requestId: string
): Promise<ActionState> => {
  console.log(`[ACTION approveScheduleChangeRequest] Initiated for request ID: ${requestId}`);
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser || !authUser.schoolId || authUser.role !== 'admin') {
      console.error("[ACTION approveScheduleChangeRequest] Error: User not authenticated as admin or not associated with a school.");
      return { success: false, error: true, message: "User must be an authenticated admin of a school." };
    }
    const schoolId = authUser.schoolId;

    const request = await prisma.scheduleChangeRequest.findUnique({
      where: { id: requestId, schoolId: schoolId },
      include: {
        lesson: { include: { class: true } }, // Include class for conflict checks
      }
    });

    if (!request) {
      console.error(`[ACTION approveScheduleChangeRequest] Error: Request ${requestId} not found in school ${schoolId}.`);
      return { success: false, error: true, message: "Schedule change request not found." };
    }

    if (request.status !== PrismaRequestStatus.PENDING) {
      console.warn(`[ACTION approveScheduleChangeRequest] Warning: Request ${requestId} is not PENDING (current: ${request.status}).`);
      return { success: false, error: true, message: `Only PENDING requests can be approved. Status: ${request.status}.` };
    }

    console.log(`[ACTION approveScheduleChangeRequest] Processing approval for request ${requestId}, type: ${request.requestedChangeType}`);

    if (request.requestedChangeType === PrismaScheduleChangeType.TIME_CHANGE) {
      if (!request.proposedDay || !request.proposedStartTime || !request.proposedEndTime) {
        console.error("[ACTION approveScheduleChangeRequest] Error: TIME_CHANGE missing proposed day/time details.");
        return { success: false, error: true, message: "Proposed day and time details are missing for time change approval." };
      }

      const lessonToUpdate = request.lesson;
      // Ensure proposed times are actual Date objects for comparison and DB update
      // The request stores them as string/time, convertToDateTime was used for creation, 
      // but for approval, they might be serialized Date strings or just time strings from the request.
      // For this approval action, request.proposedStartTime and request.proposedEndTime are full Date objects 
      // because the createScheduleChangeRequest action stores them as such for TIME_CHANGE requests.
      const newStartTime = new Date(request.proposedStartTime); 
      const newEndTime = new Date(request.proposedEndTime);     
      const newDay = request.proposedDay;

      // --- CONFLICT CHECKS FOR TIME_CHANGE (similar to updateLesson) ---
      const DEFAULT_WORK_START_HOUR = 8;
      const DEFAULT_WORK_END_HOUR = 17;
      if (newDay === Day.SATURDAY || newDay === Day.SUNDAY) {
        return { success: false, error: true, message: `Lessons cannot be on ${newDay.toLowerCase()}s.` };
      }
      const lessonStartHour = newStartTime.getHours();
      const lessonEndHour = newEndTime.getHours();
      const lessonEndMinutes = newEndTime.getMinutes();
      if (!(lessonStartHour >= DEFAULT_WORK_START_HOUR && (lessonEndHour < DEFAULT_WORK_END_HOUR || (lessonEndHour === DEFAULT_WORK_END_HOUR && lessonEndMinutes === 0)))) {
        return { success: false, error: true, message: `Proposed time is outside default work hours (${DEFAULT_WORK_START_HOUR}:00-${DEFAULT_WORK_END_HOUR}:00).` };
      }
      const unavailableSlots = await prisma.teacherAvailability.findMany({
        where: { teacherId: lessonToUpdate.teacherId, schoolId: schoolId, dayOfWeek: newDay, isAvailable: false }
      });
      const conflictingUnavailableSlot = unavailableSlots.find(slot => {
        const dbSlotStart = new Date(slot.startTime); 
        const dbSlotEnd = new Date(slot.endTime);     
        const effectiveSlotStart = new Date(newStartTime); 
        effectiveSlotStart.setHours(dbSlotStart.getHours(), dbSlotStart.getMinutes(), 0, 0);
        const effectiveSlotEnd = new Date(newStartTime);    
        effectiveSlotEnd.setHours(dbSlotEnd.getHours(), dbSlotEnd.getMinutes(), 0, 0);
        return newStartTime < effectiveSlotEnd && newEndTime > effectiveSlotStart;
      });
      if (conflictingUnavailableSlot) {
        return { success: false, error: true, message: "Proposed time conflicts with teacher's unavailable block." };
      }

      const teacherOverlap = await prisma.lesson.findFirst({
        where: {
          teacherId: lessonToUpdate.teacherId, schoolId: schoolId, day: newDay,
          id: { not: lessonToUpdate.id }, 
          startTime: { lt: newEndTime }, endTime: { gt: newStartTime },
        }
      });
      if (teacherOverlap) {
        return { success: false, error: true, message: "Proposed time conflicts with another of the teacher's lessons." };
      }

      const classOverlap = await prisma.lesson.findFirst({
        where: {
          classId: lessonToUpdate.classId, schoolId: schoolId, day: newDay,
          id: { not: lessonToUpdate.id }, 
          startTime: { lt: newEndTime }, endTime: { gt: newStartTime },
        }
      });
      if (classOverlap) {
        return { success: false, error: true, message: "Proposed time conflicts with another lesson for this class." };
      }
      
      console.log(`[ACTION approveScheduleChangeRequest] TIME_CHANGE: All conflict checks passed for lesson ${lessonToUpdate.id}. Updating lesson.`);
      await prisma.lesson.update({
        where: { id: lessonToUpdate.id, schoolId: schoolId },
        data: { day: newDay, startTime: newStartTime, endTime: newEndTime },
      });

    } else if (request.requestedChangeType === PrismaScheduleChangeType.SWAP) {
      if (!request.proposedSwapTeacherId) {
        console.error("[ACTION approveScheduleChangeRequest] Error: SWAP type missing proposedSwapTeacherId.");
        return { success: false, error: true, message: "Swap teacher ID is missing for SWAP approval." };
      }
      const lessonToUpdate = request.lesson;
      const newTeacherId = request.proposedSwapTeacherId;

      const DEFAULT_WORK_START_HOUR = 8;
      const DEFAULT_WORK_END_HOUR = 17;
      if (lessonToUpdate.day === Day.SATURDAY || lessonToUpdate.day === Day.SUNDAY) {
        return { success: false, error: true, message: `Original lesson is on a ${lessonToUpdate.day.toLowerCase()}, cannot swap.` };
      }
      const lessonStartHour = lessonToUpdate.startTime.getHours();
      const lessonEndHour = lessonToUpdate.endTime.getHours();
      const lessonEndMinutes = lessonToUpdate.endTime.getMinutes();
      if (!(lessonStartHour >= DEFAULT_WORK_START_HOUR && (lessonEndHour < DEFAULT_WORK_END_HOUR || (lessonEndHour === DEFAULT_WORK_END_HOUR && lessonEndMinutes === 0)))) {
        return { success: false, error: true, message: `Original lesson time is outside default work hours for the new teacher (${DEFAULT_WORK_START_HOUR}:00-${DEFAULT_WORK_END_HOUR}:00).` };
      }
      const unavailableSlotsNewTeacher = await prisma.teacherAvailability.findMany({
        where: { teacherId: newTeacherId, schoolId: schoolId, dayOfWeek: lessonToUpdate.day, isAvailable: false }
      });
      const conflictingUnavailableSlotNewTeacher = unavailableSlotsNewTeacher.find(slot => {
        const dbSlotStart = new Date(slot.startTime); 
        const dbSlotEnd = new Date(slot.endTime);     
        const effectiveSlotStart = new Date(lessonToUpdate.startTime); 
        effectiveSlotStart.setHours(dbSlotStart.getHours(), dbSlotStart.getMinutes(), 0, 0);
        const effectiveSlotEnd = new Date(lessonToUpdate.startTime);   
        effectiveSlotEnd.setHours(dbSlotEnd.getHours(), dbSlotEnd.getMinutes(), 0, 0);
        return lessonToUpdate.startTime < effectiveSlotEnd && lessonToUpdate.endTime > effectiveSlotStart;
      });
      if (conflictingUnavailableSlotNewTeacher) {
        return { success: false, error: true, message: "Lesson time conflicts with the proposed swap teacher's unavailable block." };
      }

      const newTeacherOverlap = await prisma.lesson.findFirst({
        where: {
          teacherId: newTeacherId, schoolId: schoolId, day: lessonToUpdate.day,
          startTime: { lt: lessonToUpdate.endTime }, endTime: { gt: lessonToUpdate.startTime },
        }
      });
      if (newTeacherOverlap) {
        return { success: false, error: true, message: "Proposed swap teacher has another lesson at this time." };
      }

      console.log(`[ACTION approveScheduleChangeRequest] SWAP: All conflict checks passed for lesson ${lessonToUpdate.id} with new teacher ${newTeacherId}. Updating lesson.`);
      await prisma.lesson.update({
        where: { id: lessonToUpdate.id, schoolId: schoolId },
        data: { teacherId: newTeacherId },
      });
    } else {
      console.error(`[ACTION approveScheduleChangeRequest] Error: Unknown request type: ${request.requestedChangeType}`);
      return { success: false, error: true, message: "Unknown request type." };
    }

    await prisma.scheduleChangeRequest.update({
      where: { id: requestId },
      data: {
        status: PrismaRequestStatus.APPROVED,
        adminNotes: "Approved", 
      },
    });

    console.log(`[ACTION approveScheduleChangeRequest] Request ${requestId} successfully APPROVED.`);
    revalidatePath(`/schools/${schoolId}/admin/schedule-requests`);
    revalidatePath(`/schools/${schoolId}/teacher/my-requests`);
    revalidatePath(`/schools/${schoolId}/teacher/my-schedule`); 
    revalidatePath(`/schools/${schoolId}/admin/schedule`);      

    return { success: true, error: false, message: "Schedule change request approved and lesson updated." };

  } catch (err: any) {
    console.error("[ACTION approveScheduleChangeRequest] Error caught:", err);
    let errMsg = "Failed to approve schedule change request due to an unexpected error.";
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        errMsg = `Database error: ${err.message} (Code: ${err.code})`;
    }
    else if (err instanceof Error) {
        errMsg = err.message;
    }
    return { success: false, error: true, message: errMsg };
  }
};

// --- ROOM ACTIONS --- 

export const createRoom = async (
  currentState: ActionState,
  data: RoomSchema
): Promise<ActionState> => {
  "use server";
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }

    const validatedFields = roomSchema.safeParse(data);
    if (!validatedFields.success) {
      const errorMessages = validatedFields.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join("; ");
      return {
        success: false,
        error: true,
        message: "Invalid input: " + errorMessages,
      };
    }
    
    const { name, type, capacity, description, schoolId: formSchoolId } = validatedFields.data;

    if (authUser.role !== 'system_admin' && authUser.schoolId !== formSchoolId) {
        return { success: false, error: true, message: "Forbidden: School ID mismatch." };
    }
    if (authUser.role !== 'system_admin' && authUser.role !== 'admin') {
        return { success: false, error: true, message: "Forbidden: Insufficient privileges to create room." };
    }

    await prisma.room.create({
      data: {
        name,
        type,
        capacity,
        description,
        schoolId: formSchoolId,
      },
    });

    revalidatePath(`/schools/${formSchoolId}/list/rooms`); 
    return { success: true, error: false, message: "Room created successfully." };

  } catch (err: any) {
    console.error("[createRoom Action Error]", err);
    if (err.code === 'P2002' && err.meta?.target?.includes('name') && err.meta?.target?.includes('schoolId')) {
        return { success: false, error: true, message: "A room with this name already exists in this school." };
    }
    return { success: false, error: true, message: "Failed to create room. " + (err.message || "") };
  }
};

export const updateRoom = async (
  currentState: ActionState,
  data: RoomSchema 
): Promise<ActionState> => {
  "use server";
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }
    
    const validatedFields = roomSchema.safeParse(data);
    if (!validatedFields.success) {
      const errorMessages = validatedFields.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join("; ");
      return {
        success: false,
        error: true,
        message: "Invalid input for update: " + errorMessages,
      };
    }

    const { id, name, type, capacity, description, schoolId: formSchoolId } = validatedFields.data;

    if (!id) {
      return { success: false, error: true, message: "Room ID is required for update." };
    }
    if (!formSchoolId) {
      return { success: false, error: true, message: "School ID is required for update." };
    }

    if (authUser.role !== 'system_admin' && authUser.schoolId !== formSchoolId) {
        return { success: false, error: true, message: "Forbidden: School ID mismatch for update." };
    }
    if (authUser.role !== 'system_admin' && authUser.role !== 'admin') {
        return { success: false, error: true, message: "Forbidden: Insufficient privileges to update room." };
    }

    const existingRoom = await prisma.room.findUnique({
        where: { id: id }
    });
    if (!existingRoom || existingRoom.schoolId !== formSchoolId) {
        return { success: false, error: true, message: "Room not found in this school or ID mismatch." };
    }

    await prisma.room.update({
      where: {
        id: id,
        schoolId: formSchoolId,
      },
      data: {
        name,
        type,
        capacity,
        description,
      },
    });

    revalidatePath(`/schools/${formSchoolId}/list/rooms`);
    return { success: true, error: false, message: "Room updated successfully." };

  } catch (err: any) {
    console.error("[updateRoom Action Error]", err);
    if (err.code === 'P2002' && err.meta?.target?.includes('name') && err.meta?.target?.includes('schoolId')) {
        return { success: false, error: true, message: "A room with this name already exists in this school." };
    }
    return { success: false, error: true, message: "Failed to update room. " + (err.message || "") };
  }
};

export const deleteRoom = async (
  currentState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  "use server";
  const idString = formData.get("id") as string;
  const id = parseInt(idString);
   if (isNaN(id)) {
     return { success: false, error: true, message: "Invalid Room ID." };
  }

  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return { success: false, error: true, message: "User not authenticated." };
    }
    
    const roomToDelete = await prisma.room.findUnique({
        where: { id: id }
    });

    if (!roomToDelete) {
      return { success: false, error: true, message: "Room not found." };
    }

    // Authorization
    if (authUser.role !== 'system_admin' && authUser.schoolId !== roomToDelete.schoolId) {
        return { success: false, error: true, message: "Forbidden: You do not have permission to delete this room for the specified school." };
    }
    if (authUser.role !== 'system_admin' && authUser.role !== 'admin') {
        return { success: false, error: true, message: "Forbidden: Insufficient privileges to delete room." };
    }

    await prisma.room.delete({
      where: {
        id: id,
        schoolId: roomToDelete.schoolId, // Ensure deleting from the correct school
      },
    });

    revalidatePath(`/schools/${roomToDelete.schoolId}/list/rooms`);
    return { success: true, error: false, message: "Room deleted successfully." };

  } catch (err: any) {
    console.error("[deleteRoom Action Error]", err);
    return { success: false, error: true, message: "Failed to delete room. It might be in use or another error occurred." };
  }
};

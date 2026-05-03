"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { userHasSchoolAccess } from "@/lib/schoolAccess";
import {
  assertNoTermOverlap,
  assertStartBeforeEnd,
  assertTermWithinAcademicYear,
  findAcademicYearForSchool,
  findTermForSchool,
  setSingleActiveTerm,
  TemporalRuleError,
  toDate,
} from "@/lib/domain/temporalRules";

type TermActionState = {
  success: boolean;
  message: string;
  code?: string;
  term?: any;
};

type CreateTermInput = {
  schoolId: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
};

type UpdateTermInput = {
  name?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  isArchived?: boolean;
};

export async function createTermAction(input: CreateTermInput): Promise<TermActionState> {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== "admin" || !(await userHasSchoolAccess(currentUser, input.schoolId))) {
    return { success: false, message: "You are not authorized to perform this action.", code: "FORBIDDEN" };
  }

  try {
    const parentYear = await findAcademicYearForSchool(input.academicYearId, input.schoolId);
    if (!parentYear) {
      return { success: false, message: "Academic year not found.", code: "ACADEMIC_YEAR_NOT_FOUND" };
    }
    if (parentYear.isArchived) {
      return { success: false, message: "Cannot create term in archived academic year.", code: "ACADEMIC_YEAR_ARCHIVED" };
    }

    const startDate = toDate(input.startDate);
    const endDate = toDate(input.endDate);
    assertStartBeforeEnd(startDate, endDate, "term");
    assertTermWithinAcademicYear({
      termStartDate: startDate,
      termEndDate: endDate,
      academicYearStartDate: parentYear.startDate,
      academicYearEndDate: parentYear.endDate,
    });
    await assertNoTermOverlap({
      schoolId: input.schoolId,
      academicYearId: input.academicYearId,
      startDate,
      endDate,
    });

    const term = await prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.term.updateMany({
          where: { schoolId: input.schoolId, academicYearId: input.academicYearId },
          data: { isActive: false },
        });
      }

      return tx.term.create({
        data: {
          schoolId: input.schoolId,
          academicYearId: input.academicYearId,
          name: input.name,
          startDate,
          endDate,
          isActive: input.isActive ?? false,
        },
      });
    });

    revalidatePath(`/schools/${input.schoolId}/academic-years`);
    revalidatePath(`/schools/${input.schoolId}/admin/schedule`);
    return { success: true, message: "Term created successfully.", term };
  } catch (error: any) {
    if (error instanceof TemporalRuleError) {
      return { success: false, message: error.message, code: error.code };
    }
    if (error.code === "P2002") {
      return { success: false, message: "A term with this name already exists in this academic year.", code: "TERM_NAME_CONFLICT" };
    }
    return { success: false, message: "Failed to create term due to a server error.", code: "SERVER_ERROR" };
  }
}

export async function updateTermAction(
  schoolId: string,
  academicYearId: string,
  termId: string,
  input: UpdateTermInput
): Promise<TermActionState> {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== "admin" || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: "You are not authorized to perform this action.", code: "FORBIDDEN" };
  }

  try {
    const parentYear = await findAcademicYearForSchool(academicYearId, schoolId);
    if (!parentYear) {
      return { success: false, message: "Academic year not found.", code: "ACADEMIC_YEAR_NOT_FOUND" };
    }

    const existingTerm = await findTermForSchool(termId, schoolId);
    if (!existingTerm || existingTerm.academicYearId !== academicYearId) {
      return { success: false, message: "Term not found in the selected academic year.", code: "TERM_NOT_FOUND" };
    }

    const startDate = input.startDate ? toDate(input.startDate) : existingTerm.startDate;
    const endDate = input.endDate ? toDate(input.endDate) : existingTerm.endDate;

    assertStartBeforeEnd(startDate, endDate, "term");
    assertTermWithinAcademicYear({
      termStartDate: startDate,
      termEndDate: endDate,
      academicYearStartDate: parentYear.startDate,
      academicYearEndDate: parentYear.endDate,
    });
    await assertNoTermOverlap({
      schoolId,
      academicYearId,
      startDate,
      endDate,
      excludeId: termId,
    });

    if (parentYear.isArchived && (input.isActive || input.isArchived === false)) {
      return {
        success: false,
        message: "Cannot activate or unarchive term while parent academic year is archived.",
        code: "ACADEMIC_YEAR_ARCHIVED",
      };
    }

    const term = await prisma.$transaction(async (tx) => {
      if (input.isActive === true) {
        await setSingleActiveTerm({ tx, schoolId, academicYearId, termId });
      } else if (input.isActive === false) {
        await tx.term.update({ where: { id: termId }, data: { isActive: false } });
      }

      return tx.term.update({
        where: { id: termId },
        data: {
          name: input.name,
          startDate: input.startDate ? startDate : undefined,
          endDate: input.endDate ? endDate : undefined,
          isActive: input.isActive,
          isArchived: input.isArchived,
        },
      });
    });

    revalidatePath(`/schools/${schoolId}/academic-years`);
    revalidatePath(`/schools/${schoolId}/admin/schedule`);
    return { success: true, message: "Term updated successfully.", term };
  } catch (error: any) {
    if (error instanceof TemporalRuleError) {
      return { success: false, message: error.message, code: error.code };
    }
    return { success: false, message: "Failed to update term due to a server error.", code: "SERVER_ERROR" };
  }
}

export async function archiveTermAction(
  schoolId: string,
  academicYearId: string,
  termId: string
): Promise<TermActionState> {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== "admin" || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: "You are not authorized to perform this action.", code: "FORBIDDEN" };
  }

  const existingTerm = await prisma.term.findFirst({
    where: { id: termId, schoolId, academicYearId },
    select: { id: true, isArchived: true },
  });

  if (!existingTerm) {
    return { success: false, message: "Term not found.", code: "TERM_NOT_FOUND" };
  }
  if (existingTerm.isArchived) {
    return { success: false, message: "Term is already archived.", code: "TERM_ALREADY_ARCHIVED" };
  }

  const term = await prisma.term.update({
    where: { id: termId },
    data: { isArchived: true, isActive: false },
  });

  revalidatePath(`/schools/${schoolId}/academic-years`);
  revalidatePath(`/schools/${schoolId}/admin/schedule`);
  return { success: true, message: "Term archived successfully.", term };
}

export async function setActiveTermAction(
  schoolId: string,
  academicYearId: string,
  termId: string
): Promise<TermActionState> {
  const currentUser = await getServerUser();
  if (!currentUser || currentUser.role !== "admin" || !(await userHasSchoolAccess(currentUser, schoolId))) {
    return { success: false, message: "You are not authorized to perform this action.", code: "FORBIDDEN" };
  }

  try {
    const parentYear = await findAcademicYearForSchool(academicYearId, schoolId);
    if (!parentYear) {
      return { success: false, message: "Academic year not found.", code: "ACADEMIC_YEAR_NOT_FOUND" };
    }
    if (parentYear.isArchived) {
      return { success: false, message: "Cannot activate term under archived academic year.", code: "ACADEMIC_YEAR_ARCHIVED" };
    }

    const term = await findTermForSchool(termId, schoolId);
    if (!term || term.academicYearId !== academicYearId) {
      return { success: false, message: "Term not found for selected academic year.", code: "TERM_NOT_FOUND" };
    }

    await prisma.$transaction(async (tx) => {
      await setSingleActiveTerm({ tx, schoolId, academicYearId, termId });
    });

    revalidatePath(`/schools/${schoolId}/academic-years`);
    revalidatePath(`/schools/${schoolId}/admin/schedule`);
    return { success: true, message: "Term set as active successfully." };
  } catch (error: any) {
    if (error instanceof TemporalRuleError) {
      return { success: false, message: error.message, code: error.code };
    }
    return { success: false, message: "Failed to set term as active.", code: "SERVER_ERROR" };
  }
}

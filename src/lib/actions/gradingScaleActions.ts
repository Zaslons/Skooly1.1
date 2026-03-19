"use server";

import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";

async function requireSchoolAdmin(schoolId: string) {
  const user = await getServerUser();
  if (!user) throw new Error("Not authenticated");
  const isAdmin = (user.role === "admin" && user.schoolId === schoolId) || user.role === "system_admin";
  if (!isAdmin) throw new Error("Access denied");
  return user;
}

export async function createGradingScaleAction(data: {
  schoolId: string;
  name: string;
  maxScore: number;
  isDefault: boolean;
}) {
  await requireSchoolAdmin(data.schoolId);

  if (data.isDefault) {
    await prisma.gradingScale.updateMany({
      where: { schoolId: data.schoolId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const scale = await prisma.gradingScale.create({
    data: {
      schoolId: data.schoolId,
      name: data.name,
      maxScore: data.maxScore,
      isDefault: data.isDefault,
    },
    include: { bands: true },
  });

  return { success: true, scale };
}

export async function updateGradingScaleAction(data: {
  id: string;
  schoolId: string;
  name: string;
  maxScore: number;
  isDefault: boolean;
}) {
  await requireSchoolAdmin(data.schoolId);

  if (data.isDefault) {
    await prisma.gradingScale.updateMany({
      where: { schoolId: data.schoolId, isDefault: true, id: { not: data.id } },
      data: { isDefault: false },
    });
  }

  const scale = await prisma.gradingScale.update({
    where: { id: data.id },
    data: {
      name: data.name,
      maxScore: data.maxScore,
      isDefault: data.isDefault,
    },
    include: { bands: true },
  });

  return { success: true, scale };
}

export async function deleteGradingScaleAction(id: string, schoolId: string) {
  await requireSchoolAdmin(schoolId);

  await prisma.gradeBand.deleteMany({ where: { gradingScaleId: id } });
  await prisma.gradingScale.delete({ where: { id } });

  return { success: true };
}

export async function setDefaultGradingScaleAction(id: string, schoolId: string) {
  await requireSchoolAdmin(schoolId);

  await prisma.gradingScale.updateMany({
    where: { schoolId, isDefault: true },
    data: { isDefault: false },
  });

  await prisma.gradingScale.update({
    where: { id },
    data: { isDefault: true },
  });

  return { success: true };
}

export async function createGradeBandAction(data: {
  gradingScaleId: string;
  schoolId: string;
  label: string;
  abbreviation?: string;
  minPercentage: number;
  maxPercentage: number;
  color?: string;
  isPassing: boolean;
  order: number;
}) {
  await requireSchoolAdmin(data.schoolId);

  const band = await prisma.gradeBand.create({
    data: {
      gradingScaleId: data.gradingScaleId,
      label: data.label,
      abbreviation: data.abbreviation || null,
      minPercentage: data.minPercentage,
      maxPercentage: data.maxPercentage,
      color: data.color || null,
      isPassing: data.isPassing,
      order: data.order,
    },
  });

  return { success: true, band };
}

export async function updateGradeBandAction(data: {
  id: string;
  schoolId: string;
  label: string;
  abbreviation?: string;
  minPercentage: number;
  maxPercentage: number;
  color?: string;
  isPassing: boolean;
  order: number;
}) {
  await requireSchoolAdmin(data.schoolId);

  const band = await prisma.gradeBand.update({
    where: { id: data.id },
    data: {
      label: data.label,
      abbreviation: data.abbreviation || null,
      minPercentage: data.minPercentage,
      maxPercentage: data.maxPercentage,
      color: data.color || null,
      isPassing: data.isPassing,
      order: data.order,
    },
  });

  return { success: true, band };
}

export async function deleteGradeBandAction(id: string, schoolId: string) {
  await requireSchoolAdmin(schoolId);
  await prisma.gradeBand.delete({ where: { id } });
  return { success: true };
}

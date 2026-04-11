'use server';

import prisma from '@/lib/prisma';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getServerUser } from '@/lib/auth';
import { userHasSchoolAccess } from '@/lib/schoolAccess';
import { getTemplateById, loadCatalogTemplatesFromDisk } from '@/lib/catalog/loadCatalogTemplates';
import { computeCatalogInstallPreview, curriculumKey } from '@/lib/domain/catalogInstallPreview';
import {
  computeCatalogScalarRefresh,
  type CatalogScalarUpdate,
  type ExistingCurriculumRow,
} from '@/lib/domain/catalogInstallScalarRefresh';

const UpdateSchoolProfileSchema = z.object({
  schoolId: z.string().cuid(),
  country: z
    .union([z.string().length(2), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v.toUpperCase())),
  teachingSystem: z
    .union([z.string().min(1).max(64), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
});

export async function updateSchoolProfileAction(data: z.infer<typeof UpdateSchoolProfileSchema>) {
  const parsed = UpdateSchoolProfileSchema.safeParse(data);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false as const, message: first || 'Invalid input.' };
  }

  const { schoolId, country, teachingSystem } = parsed.data;

  const user = await getServerUser();
  if (!user || user.role !== 'admin' || !(await userHasSchoolAccess(user, schoolId))) {
    return { success: false as const, message: 'Unauthorized.' };
  }

  try {
    await prisma.school.update({
      where: { id: schoolId },
      data: { country, teachingSystem },
    });
    revalidatePath(`/schools/${schoolId}/admin/school-profile`);
    revalidatePath(`/schools/${schoolId}/admin/setup/catalog-install`);
    return { success: true as const, message: 'School profile updated.' };
  } catch (e: unknown) {
    return { success: false as const, message: e instanceof Error ? e.message : 'Update failed.' };
  }
}

const GradeMappingEntrySchema = z.object({
  templateIndex: z.number().int().min(0),
  gradeId: z.number().int().positive(),
});

const CatalogInstallBaseSchema = z.object({
  schoolId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  templateId: z.string().min(1),
  gradeMapping: z.array(GradeMappingEntrySchema).min(1),
  /** When true, preview/apply include updating coefficient + periodsPerWeek on existing matching rows from the template. */
  refreshScalarsFromTemplate: z.boolean().optional(),
});

function mappingArrayToRecord(rows: z.infer<typeof GradeMappingEntrySchema>[]): Record<number, number | undefined> {
  const r: Record<number, number | undefined> = {};
  for (const row of rows) {
    r[row.templateIndex] = row.gradeId;
  }
  return r;
}

async function loadPreviewContext(
  schoolId: string,
  academicYearId: string,
  templateId: string,
  gradeMapping: z.infer<typeof GradeMappingEntrySchema>[],
  refreshScalarsFromTemplate: boolean
) {
  const template = getTemplateById(templateId);
  if (!template) {
    return { error: 'Template not found.' as const };
  }

  const academicYear = await prisma.academicYear.findFirst({
    where: { id: academicYearId, schoolId, isArchived: false },
  });
  if (!academicYear) {
    return { error: 'Academic year not found or is archived.' as const };
  }

  const [grades, subjects, curricula] = await Promise.all([
    prisma.grade.findMany({ where: { schoolId }, orderBy: { level: 'asc' } }),
    prisma.subject.findMany({ where: { schoolId } }),
    prisma.curriculum.findMany({
      where: { schoolId, academicYearId },
      select: {
        id: true,
        gradeId: true,
        subjectId: true,
        coefficient: true,
        periodsPerWeek: true,
        subject: { select: { name: true } },
      },
    }),
  ]);

  const gradeById = new Map(grades.map((g) => [g.id, { level: g.level }]));
  const subjectByNameLower = new Map(subjects.map((s) => [s.name.toLowerCase(), { id: s.id, name: s.name }]));
  const existingCurriculumKeys = new Set(curricula.map((c) => curriculumKey(c.gradeId, c.subjectId)));

  const mapping = mappingArrayToRecord(gradeMapping);
  const preview = computeCatalogInstallPreview(template, mapping, gradeById, subjectByNameLower, existingCurriculumKeys);

  const existingRowsForScalar: ExistingCurriculumRow[] = curricula.map((c) => ({
    id: c.id,
    gradeId: c.gradeId,
    subjectId: c.subjectId,
    coefficient: c.coefficient,
    periodsPerWeek: c.periodsPerWeek,
    subjectName: c.subject.name,
  }));

  const scalarUpdates: CatalogScalarUpdate[] = refreshScalarsFromTemplate
    ? computeCatalogScalarRefresh(template, mapping, gradeById, existingRowsForScalar)
    : [];

  return { template, academicYear, preview, grades, subjects, scalarUpdates };
}

export async function previewCatalogInstallAction(data: z.infer<typeof CatalogInstallBaseSchema>) {
  const parsed = CatalogInstallBaseSchema.safeParse(data);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false as const, message: first || 'Invalid input.' };
  }

  const user = await getServerUser();
  if (!user || user.role !== 'admin' || !(await userHasSchoolAccess(user, parsed.data.schoolId))) {
    return { success: false as const, message: 'Unauthorized.' };
  }

  const ctx = await loadPreviewContext(
    parsed.data.schoolId,
    parsed.data.academicYearId,
    parsed.data.templateId,
    parsed.data.gradeMapping,
    parsed.data.refreshScalarsFromTemplate === true
  );
  if ('error' in ctx) {
    return { success: false as const, message: ctx.error };
  }

  return {
    success: true as const,
    preview: ctx.preview,
    scalarUpdates: ctx.scalarUpdates,
    template: { id: ctx.template.id, version: ctx.template.version, gradeLabels: ctx.template.gradeLabels },
  };
}

export async function applyCatalogInstallAction(data: z.infer<typeof CatalogInstallBaseSchema>) {
  const parsed = CatalogInstallBaseSchema.safeParse(data);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false as const, message: first || 'Invalid input.' };
  }

  const user = await getServerUser();
  if (!user || user.role !== 'admin' || !(await userHasSchoolAccess(user, parsed.data.schoolId))) {
    return { success: false as const, message: 'Unauthorized.' };
  }

  const { schoolId, academicYearId, templateId, gradeMapping, refreshScalarsFromTemplate } = parsed.data;

  const ctx = await loadPreviewContext(
    schoolId,
    academicYearId,
    templateId,
    gradeMapping,
    refreshScalarsFromTemplate === true
  );
  if ('error' in ctx) {
    return { success: false as const, message: ctx.error };
  }

  const { template, preview, scalarUpdates } = ctx;

  if (preview.unmappedGradeIndices.length > 0) {
    return {
      success: false as const,
      message: `Map all template grade indices used in the template. Missing: ${preview.unmappedGradeIndices.join(', ')}`,
    };
  }

  let createdSubjects = 0;
  let createdCurriculum = 0;
  let updatedScalars = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const subjects = await tx.subject.findMany({ where: { schoolId } });
      const nameToId = new Map(subjects.map((s) => [s.name.toLowerCase(), s.id]));

      for (const name of preview.subjectsToCreate) {
        try {
          const s = await tx.subject.create({
            data: { name, schoolId },
          });
          nameToId.set(name.toLowerCase(), s.id);
          createdSubjects += 1;
        } catch (e: unknown) {
          const code = (e as { code?: string })?.code;
          if (code === 'P2002') {
            const existing = await tx.subject.findFirst({
              where: { schoolId, name },
            });
            if (existing) nameToId.set(name.toLowerCase(), existing.id);
          } else {
            throw e;
          }
        }
      }

      for (const row of preview.curriculumToAdd) {
        const sid = nameToId.get(row.subjectName.toLowerCase());
        if (sid == null) {
          throw new Error(`Subject not resolved: ${row.subjectName}`);
        }
        try {
          await tx.curriculum.create({
            data: {
              schoolId,
              academicYearId,
              gradeId: row.gradeId,
              subjectId: sid,
              coefficient: row.coefficient,
              periodsPerWeek: row.periodsPerWeek,
            },
          });
          createdCurriculum += 1;
        } catch (e: unknown) {
          const code = (e as { code?: string })?.code;
          if (code === 'P2002') {
            continue;
          }
          throw e;
        }
      }

      if (refreshScalarsFromTemplate === true && scalarUpdates.length > 0) {
        for (const u of scalarUpdates) {
          await tx.curriculum.update({
            where: { id: u.curriculumId },
            data: {
              coefficient: u.toCoefficient,
              periodsPerWeek: u.toPeriodsPerWeek,
            },
          });
          updatedScalars += 1;
        }
      }

      await tx.academicYear.update({
        where: { id: academicYearId },
        data: {
          catalogTemplateId: template.id,
          catalogTemplateVersion: template.version,
          catalogInstalledAt: new Date(),
        },
      });
    });
  } catch (e: unknown) {
    return {
      success: false as const,
      message: e instanceof Error ? e.message : 'Install failed.',
    };
  }

  revalidatePath(`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`);
  revalidatePath(`/schools/${schoolId}/admin/setup/catalog-install`);

  const parts: string[] = [];
  if (createdSubjects > 0) {
    parts.push(`${createdSubjects} new subject(s)`);
  }
  if (createdCurriculum > 0) {
    parts.push(`${createdCurriculum} new curriculum row(s)`);
  }
  if (updatedScalars > 0) {
    parts.push(`${updatedScalars} row(s) updated (coefficient / periods per week)`);
  }
  const message =
    parts.length > 0
      ? `Catalog sync: ${parts.join('; ')}.`
      : 'Catalog metadata recorded for this year. No new subjects, curriculum rows, or scalar updates were needed (already present or skipped).';

  return {
    success: true as const,
    message,
    createdSubjects,
    createdCurriculum,
    updatedScalars,
  };
}

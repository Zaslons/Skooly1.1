import type { CatalogTemplate } from '@/lib/catalog/catalogTemplateSchema';

export type CatalogInstallPreview = {
  unmappedGradeIndices: number[];
  subjectsToCreate: string[];
  curriculumToAdd: Array<{
    templateGradeIndex: number;
    gradeId: number;
    gradeLevelLabel: string;
    subjectName: string;
    coefficient: number;
    periodsPerWeek: number | null;
  }>;
  skipped: Array<{ gradeLevelLabel: string; subjectName: string; reason: string }>;
};

/**
 * Pure preview for catalog install (Vitest-friendly).
 */
export function computeCatalogInstallPreview(
  template: CatalogTemplate,
  mapping: Record<number, number | undefined>,
  gradeById: Map<number, { level: string }>,
  subjectByNameLower: Map<string, { id: number; name: string }>,
  existingCurriculumKeys: Set<string>
): CatalogInstallPreview {
  const unmappedGradeIndices = new Set<number>();
  const subjectsToCreate = new Set<string>();
  const curriculumToAdd: CatalogInstallPreview['curriculumToAdd'] = [];
  const skipped: CatalogInstallPreview['skipped'] = [];
  const plannedKeys = new Set<string>();

  const coeff = (n: number | undefined) => (typeof n === 'number' && !Number.isNaN(n) ? n : 1);

  for (const line of template.lines) {
    for (const gIdx of line.gradeIndices) {
      const gradeId = mapping[gIdx];
      if (gradeId == null) {
        unmappedGradeIndices.add(gIdx);
        continue;
      }
      const grade = gradeById.get(gradeId);
      const gradeLevelLabel = grade?.level ?? String(gradeId);
      const subjectName = line.subjectNameDefault.trim();
      const subj = subjectByNameLower.get(subjectName.toLowerCase());

      const planKey = `${gradeId}::${subjectName.toLowerCase()}`;
      if (plannedKeys.has(planKey)) {
        skipped.push({
          gradeLevelLabel,
          subjectName,
          reason: 'duplicate_in_template',
        });
        continue;
      }

      if (subj) {
        const ck = `${gradeId}:${subj.id}`;
        if (existingCurriculumKeys.has(ck)) {
          skipped.push({ gradeLevelLabel, subjectName, reason: 'already_in_year' });
          continue;
        }
      } else {
        subjectsToCreate.add(subjectName);
      }

      plannedKeys.add(planKey);
      curriculumToAdd.push({
        templateGradeIndex: gIdx,
        gradeId,
        gradeLevelLabel,
        subjectName,
        coefficient: coeff(line.coefficient),
        periodsPerWeek: line.periodsPerWeek ?? null,
      });
    }
  }

  return {
    unmappedGradeIndices: Array.from(unmappedGradeIndices).sort((a, b) => a - b),
    subjectsToCreate: Array.from(subjectsToCreate).sort(),
    curriculumToAdd,
    skipped,
  };
}

export function curriculumKey(gradeId: number, subjectId: number): string {
  return `${gradeId}:${subjectId}`;
}

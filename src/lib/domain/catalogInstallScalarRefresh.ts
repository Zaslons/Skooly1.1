import type { CatalogTemplate } from '@/lib/catalog/catalogTemplateSchema';

export type ExistingCurriculumRow = {
  id: string;
  gradeId: number;
  subjectId: number;
  coefficient: number;
  periodsPerWeek: number | null;
  subjectName: string;
};

export type CatalogScalarUpdate = {
  curriculumId: string;
  gradeId: number;
  gradeLevelLabel: string;
  subjectName: string;
  fromCoefficient: number;
  toCoefficient: number;
  fromPeriodsPerWeek: number | null;
  toPeriodsPerWeek: number | null;
};

function coeff(n: number | undefined): number {
  return typeof n === 'number' && !Number.isNaN(n) ? n : 1;
}

function periodsEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  return a === b;
}

function coeffEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/**
 * For curriculum rows that already exist for this year, find rows whose coefficient/periodsPerWeek
 * differ from the current template line (same grade mapping + subject name as install).
 */
export function computeCatalogScalarRefresh(
  template: CatalogTemplate,
  mapping: Record<number, number | undefined>,
  gradeById: Map<number, { level: string }>,
  existingRows: ExistingCurriculumRow[]
): CatalogScalarUpdate[] {
  const plannedKeys = new Set<string>();
  const updates: CatalogScalarUpdate[] = [];

  for (const line of template.lines) {
    for (const gIdx of line.gradeIndices) {
      const gradeId = mapping[gIdx];
      if (gradeId == null) continue;

      const subjectName = line.subjectNameDefault.trim();
      const planKey = `${gradeId}::${subjectName.toLowerCase()}`;
      if (plannedKeys.has(planKey)) continue;
      plannedKeys.add(planKey);

      const gradeLevelLabel = gradeById.get(gradeId)?.level ?? String(gradeId);
      const toCoefficient = coeff(line.coefficient);
      const toPeriods = line.periodsPerWeek ?? null;

      const match = [...existingRows].find(
        (r) => r.gradeId === gradeId && r.subjectName.trim().toLowerCase() === subjectName.toLowerCase()
      );
      if (!match) continue;

      const coeffDiff = !coeffEqual(match.coefficient, toCoefficient);
      const perDiff = !periodsEqual(match.periodsPerWeek, toPeriods);
      if (!coeffDiff && !perDiff) continue;

      updates.push({
        curriculumId: match.id,
        gradeId,
        gradeLevelLabel,
        subjectName: match.subjectName,
        fromCoefficient: match.coefficient,
        toCoefficient,
        fromPeriodsPerWeek: match.periodsPerWeek,
        toPeriodsPerWeek: toPeriods,
      });
    }
  }

  return updates;
}

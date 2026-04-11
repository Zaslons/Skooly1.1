/**
 * Pure helpers for curriculum copy-from-year preview (Vitest-friendly).
 */

export function curriculumPairKey(gradeId: number, subjectId: number): string {
  return `${gradeId}:${subjectId}`;
}

export function buildExistingTargetKeySet(
  rows: ReadonlyArray<{ gradeId: number; subjectId: number }>
): Set<string> {
  return new Set(rows.map((r) => curriculumPairKey(r.gradeId, r.subjectId)));
}

export type PartitionResult<T extends { gradeId: number; subjectId: number }> = {
  toCreate: T[];
  skipped: T[];
};

/** Split source rows into those that can be copied vs those that already exist on the target year. */
export function partitionCurriculumCopyRows<T extends { gradeId: number; subjectId: number }>(
  sourceRows: T[],
  existingTargetKeys: Set<string>
): PartitionResult<T> {
  const toCreate: T[] = [];
  const skipped: T[] = [];
  for (const row of sourceRows) {
    const key = curriculumPairKey(row.gradeId, row.subjectId);
    if (existingTargetKeys.has(key)) {
      skipped.push(row);
    } else {
      toCreate.push(row);
    }
  }
  return { toCreate, skipped };
}

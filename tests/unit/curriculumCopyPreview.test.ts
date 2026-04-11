import { describe, expect, it } from 'vitest';
import { buildExistingTargetKeySet, partitionCurriculumCopyRows } from '@/lib/domain/curriculumCopyPreview';

describe('partitionCurriculumCopyRows', () => {
  it('puts rows not on target into toCreate', () => {
    const source = [
      { gradeId: 1, subjectId: 10, grade: { level: 'G1' }, subject: { name: 'Math' } },
      { gradeId: 2, subjectId: 11, grade: { level: 'G2' }, subject: { name: 'Art' } },
    ];
    const existing = buildExistingTargetKeySet([{ gradeId: 1, subjectId: 10 }]);
    const { toCreate, skipped } = partitionCurriculumCopyRows(source, existing);
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].subject.name).toBe('Art');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].subject.name).toBe('Math');
  });

  it('creates all when target is empty', () => {
    const source = [{ gradeId: 1, subjectId: 10 }];
    const { toCreate, skipped } = partitionCurriculumCopyRows(source, new Set());
    expect(toCreate).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });
});

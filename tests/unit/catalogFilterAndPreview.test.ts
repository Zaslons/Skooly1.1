import { describe, expect, it } from 'vitest';
import { filterTemplatesForSchoolProfile } from '@/lib/catalog/filterTemplatesForSchool';
import { computeCatalogInstallPreview } from '@/lib/domain/catalogInstallPreview';
import type { CatalogTemplate } from '@/lib/catalog/catalogTemplateSchema';

const baseTemplate: CatalogTemplate = {
  id: 't1',
  version: '1',
  country: 'MA',
  teachingSystem: 'national_morocco',
  gradeLabels: ['G0', 'G1'],
  lines: [
    {
      subjectCode: 'X',
      subjectNameDefault: 'Math',
      gradeIndices: [0],
      coefficient: 2,
      periodsPerWeek: 4,
    },
  ],
};

describe('filterTemplatesForSchoolProfile', () => {
  it('returns all templates when country or teaching system is unset', () => {
    const r1 = filterTemplatesForSchoolProfile([baseTemplate], null, 'national_morocco');
    expect(r1.filterActive).toBe(false);
    expect(r1.templates).toHaveLength(1);

    const r2 = filterTemplatesForSchoolProfile([baseTemplate], 'MA', null);
    expect(r2.filterActive).toBe(false);
  });

  it('filters when both profile fields are set', () => {
    const other: CatalogTemplate = { ...baseTemplate, id: 't2', country: 'FR', teachingSystem: 'national_morocco' };
    const r = filterTemplatesForSchoolProfile([baseTemplate, other], 'MA', 'national_morocco');
    expect(r.filterActive).toBe(true);
    expect(r.templates.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('computeCatalogInstallPreview', () => {
  it('plans new subject and curriculum row when none exist', () => {
    const p = computeCatalogInstallPreview(
      baseTemplate,
      { 0: 10 },
      new Map([[10, { level: 'Grade A' }]]),
      new Map(),
      new Set()
    );
    expect(p.unmappedGradeIndices).toEqual([]);
    expect(p.subjectsToCreate).toEqual(['Math']);
    expect(p.curriculumToAdd).toHaveLength(1);
    expect(p.curriculumToAdd[0].gradeId).toBe(10);
  });

  it('skips when curriculum already exists for grade+subject', () => {
    const p = computeCatalogInstallPreview(
      baseTemplate,
      { 0: 10 },
      new Map([[10, { level: 'Grade A' }]]),
      new Map([['math', { id: 5, name: 'Math' }]]),
      new Set(['10:5'])
    );
    expect(p.subjectsToCreate).toEqual([]);
    expect(p.curriculumToAdd).toHaveLength(0);
    expect(p.skipped.some((s) => s.reason === 'already_in_year')).toBe(true);
  });

  it('records unmapped grade indices', () => {
    const p = computeCatalogInstallPreview(
      baseTemplate,
      {},
      new Map(),
      new Map(),
      new Set()
    );
    expect(p.unmappedGradeIndices).toContain(0);
  });
});

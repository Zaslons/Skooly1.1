import { describe, expect, it } from 'vitest';
import { computeCatalogScalarRefresh } from '@/lib/domain/catalogInstallScalarRefresh';
import type { CatalogTemplate } from '@/lib/catalog/catalogTemplateSchema';

const template: CatalogTemplate = {
  id: 't1',
  version: '1.0.0',
  country: 'MA',
  teachingSystem: 'national_morocco',
  gradeLabels: ['G1'],
  lines: [
    {
      subjectCode: 'M',
      subjectNameDefault: 'Mathematics',
      gradeIndices: [0],
      coefficient: 3,
      periodsPerWeek: 5,
    },
  ],
};

describe('computeCatalogScalarRefresh', () => {
  it('suggests update when coefficient or periods differ', () => {
    const mapping = { 0: 10 };
    const gradeById = new Map([[10, { level: 'Grade 7' }]]);
    const existing = [
      {
        id: 'c1',
        gradeId: 10,
        subjectId: 1,
        coefficient: 1,
        periodsPerWeek: 4,
        subjectName: 'Mathematics',
      },
    ];
    const u = computeCatalogScalarRefresh(template, mapping, gradeById, existing);
    expect(u).toHaveLength(1);
    expect(u[0].fromCoefficient).toBe(1);
    expect(u[0].toCoefficient).toBe(3);
    expect(u[0].fromPeriodsPerWeek).toBe(4);
    expect(u[0].toPeriodsPerWeek).toBe(5);
  });

  it('returns empty when values already match', () => {
    const mapping = { 0: 10 };
    const gradeById = new Map([[10, { level: 'Grade 7' }]]);
    const existing = [
      {
        id: 'c1',
        gradeId: 10,
        subjectId: 1,
        coefficient: 3,
        periodsPerWeek: 5,
        subjectName: 'Mathematics',
      },
    ];
    expect(computeCatalogScalarRefresh(template, mapping, gradeById, existing)).toHaveLength(0);
  });

  it('ignores rows with no matching curriculum', () => {
    const mapping = { 0: 10 };
    const gradeById = new Map([[10, { level: 'Grade 7' }]]);
    const existing = [
      {
        id: 'c1',
        gradeId: 11,
        subjectId: 1,
        coefficient: 1,
        periodsPerWeek: null,
        subjectName: 'Mathematics',
      },
    ];
    expect(computeCatalogScalarRefresh(template, mapping, gradeById, existing)).toHaveLength(0);
  });
});

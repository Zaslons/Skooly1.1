import { describe, expect, it } from 'vitest';
import {
  createPeriodsPerWeekSchema,
  createSyllabusUrlSchema,
  CurriculumBookInputSchema,
  initialBooksSchema,
  updateSyllabusUrlSchema,
} from '@/lib/validation/curriculumSchemas';

describe('createSyllabusUrlSchema', () => {
  it('maps empty string to null', () => {
    expect(createSyllabusUrlSchema.safeParse('').success).toBe(true);
    expect(createSyllabusUrlSchema.safeParse('').data).toBeNull();
  });

  it('accepts valid url', () => {
    const r = createSyllabusUrlSchema.safeParse('https://example.com/syllabus');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://example.com/syllabus');
  });
});

describe('updateSyllabusUrlSchema', () => {
  it('maps empty string to null', () => {
    const r = updateSyllabusUrlSchema.safeParse('');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('preserves undefined when key omitted', () => {
    const r = updateSyllabusUrlSchema.safeParse(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeUndefined();
  });
});

describe('CurriculumBookInputSchema', () => {
  it('requires title', () => {
    expect(CurriculumBookInputSchema.safeParse({ title: '' }).success).toBe(false);
    expect(
      CurriculumBookInputSchema.safeParse({
        title: 'Algebra 1',
        role: 'primary',
      }).success
    ).toBe(true);
  });
});

describe('createPeriodsPerWeekSchema', () => {
  it('accepts null for empty', () => {
    const r = createPeriodsPerWeekSchema.safeParse('');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('accepts integer in range', () => {
    const r = createPeriodsPerWeekSchema.safeParse(4);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(4);
  });
});

describe('initialBooksSchema', () => {
  it('rejects more than 20 items', () => {
    const books = Array.from({ length: 21 }, (_, i) => ({ title: `B${i}` }));
    expect(initialBooksSchema.safeParse(books).success).toBe(false);
  });

  it('accepts up to 20 items', () => {
    const books = Array.from({ length: 20 }, (_, i) => ({ title: `B${i}` }));
    expect(initialBooksSchema.safeParse(books).success).toBe(true);
  });
});

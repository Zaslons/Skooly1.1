import { z } from 'zod';

export const CURRICULUM_BOOK_ROLES = [
  'primary',
  'supplementary',
  'workbook',
  'reader',
  'teacher',
  'digital',
  'other',
] as const;

export type CurriculumBookRoleValue = (typeof CURRICULUM_BOOK_ROLES)[number];

export const CurriculumBookRoleSchema = z.enum(CURRICULUM_BOOK_ROLES);

/** Create: empty/undefined → null; otherwise valid URL. */
export const createSyllabusUrlSchema = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.union([z.string().url({ message: 'Must be a valid URL' }), z.null()])
).optional();

/** Update: empty string → null; missing key stays undefined (no change). */
export const updateSyllabusUrlSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.string().url({ message: 'Must be a valid URL' }), z.null(), z.undefined()])
);

export const CurriculumBookInputSchema = z.object({
  title: z.string().min(1, { message: 'Title is required.' }),
  authors: z.string().optional().nullable(),
  isbn: z.string().optional().nullable(),
  publisher: z.string().optional().nullable(),
  edition: z.string().optional().nullable(),
  role: CurriculumBookRoleSchema.default('primary'),
  notes: z.string().optional().nullable(),
});

export const initialBooksSchema = z.array(CurriculumBookInputSchema).max(20).optional();

/** Create: empty/undefined → null; 0–60 periods/week for timetable hints. */
export const createPeriodsPerWeekSchema = z.preprocess(
  (v) => {
    if (v === '' || v === undefined || v === null) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (Number.isNaN(n)) return null;
    return n;
  },
  z.union([z.number().int().min(0).max(60), z.null()]).optional()
);

/** Update: undefined = no change; ''/null = clear. */
export const updatePeriodsPerWeekSchema = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v === '' || v === null) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (Number.isNaN(n)) return undefined;
    return n;
  },
  z.union([z.number().int().min(0).max(60), z.null(), z.undefined()])
);

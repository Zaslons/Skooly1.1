import { z } from 'zod';

export const CatalogLineSchema = z.object({
  subjectCode: z.string().min(1),
  subjectNameDefault: z.string().min(1),
  gradeIndices: z.array(z.number().int().min(0)),
  coefficient: z.number().min(0.1).max(100).optional(),
  periodsPerWeek: z.number().int().min(0).max(60).optional(),
});

export const CatalogTemplateSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  country: z.string().length(2).transform((s) => s.toUpperCase()),
  teachingSystem: z.string().min(1),
  gradeLabels: z.array(z.string()).min(1),
  lines: z.array(CatalogLineSchema).min(1),
});

export type CatalogTemplate = z.infer<typeof CatalogTemplateSchema>;
export type CatalogLine = z.infer<typeof CatalogLineSchema>;

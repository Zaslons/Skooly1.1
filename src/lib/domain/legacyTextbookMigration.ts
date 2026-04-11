/**
 * Pure helpers for legacy `Curriculum.textbook` → `CurriculumBook` migration semantics (tests + docs).
 * The actual DB migration is SQL in prisma/migrations.
 */

export function shouldMigrateLegacyTextbookToBook(textbook: string | null | undefined, existingBookCount: number): boolean {
  if (existingBookCount > 0) return false;
  if (textbook == null) return false;
  return textbook.trim().length > 0;
}

export function legacyTextbookBookTitle(textbook: string): string {
  return textbook.trim();
}

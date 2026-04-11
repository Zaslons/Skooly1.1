import { describe, expect, it } from 'vitest';
import { legacyTextbookBookTitle, shouldMigrateLegacyTextbookToBook } from '@/lib/domain/legacyTextbookMigration';

describe('shouldMigrateLegacyTextbookToBook', () => {
  it('returns true when textbook is non-empty and there are no books', () => {
    expect(shouldMigrateLegacyTextbookToBook('  Math 101  ', 0)).toBe(true);
  });

  it('returns false when books already exist', () => {
    expect(shouldMigrateLegacyTextbookToBook('Math', 1)).toBe(false);
  });

  it('returns false when textbook is null or blank', () => {
    expect(shouldMigrateLegacyTextbookToBook(null, 0)).toBe(false);
    expect(shouldMigrateLegacyTextbookToBook(undefined, 0)).toBe(false);
    expect(shouldMigrateLegacyTextbookToBook('   ', 0)).toBe(false);
  });
});

describe('legacyTextbookBookTitle', () => {
  it('trims whitespace', () => {
    expect(legacyTextbookBookTitle('  Title  ')).toBe('Title');
  });
});

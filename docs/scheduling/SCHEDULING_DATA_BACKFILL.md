# Scheduling data backfill (assignments)

E1 asked for **backward compatibility** and **optional backfill** of `Assignment.dueLessonId` when legacy rows only had `dueDate` / `lessonId`.

## Current behavior

- New assignments should set `dueLessonId` (and `dueDate` derived) via server actions.
- `Assignment.dueLessonId` is nullable for legacy rows.

## Optional SQL (review before running)

If your product rule is **“due lesson = source lesson”** for legacy rows that only had `lessonId`:

```sql
-- Optional: set dueLessonId from source lesson when still null
UPDATE "Assignment"
SET "dueLessonId" = "lessonId"
WHERE "dueLessonId" IS NULL
  AND "lessonId" IS NOT NULL;
```

If due lesson must differ from source lesson, **do not** run the above; backfill per row in admin or a custom script.

## Verification

```sql
SELECT COUNT(*) FROM "Assignment" WHERE "dueLessonId" IS NULL AND "lessonId" IS NOT NULL;
```

After backfill, re-run the app’s assignment flows and list pages.

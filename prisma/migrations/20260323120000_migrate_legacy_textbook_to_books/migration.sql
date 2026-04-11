-- Phase D: Copy non-empty legacy Curriculum.textbook into CurriculumBook (primary) when the row has no books, then clear textbook.

WITH inserted AS (
  INSERT INTO "CurriculumBook" ("id", "curriculumId", "sortOrder", "title", "role", "createdAt", "updatedAt")
  SELECT
    gen_random_uuid()::text,
    c."id",
    0,
    trim(both from c."textbook"),
    'primary'::"CurriculumBookRole",
    NOW(),
    NOW()
  FROM "Curriculum" c
  WHERE c."textbook" IS NOT NULL
    AND length(trim(both from c."textbook")) > 0
    AND NOT EXISTS (
      SELECT 1 FROM "CurriculumBook" b WHERE b."curriculumId" = c."id"
    )
  RETURNING "curriculumId"
)
UPDATE "Curriculum" u
SET "textbook" = NULL
FROM inserted i
WHERE u."id" = i."curriculumId";

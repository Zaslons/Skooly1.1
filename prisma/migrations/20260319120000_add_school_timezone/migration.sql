-- E4: Add per-school timezone for local date iteration.
ALTER TABLE "School"
ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC';


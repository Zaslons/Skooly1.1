-- AlterTable
ALTER TABLE "Auth" ADD COLUMN "username" TEXT; -- Add as nullable first

-- Populate username for existing rows
UPDATE "Auth" SET "username" = 'user_' || id WHERE "username" IS NULL; -- Ensure all existing rows get a unique username

-- Now make it NOT NULL
ALTER TABLE "Auth" ALTER COLUMN "username" SET NOT NULL;

-- Add unique constraint for email if it wasn't already clear (it should be from your schema)
-- If email is already unique, this might not be strictly needed or might be part of the existing generated SQL for making email optional.
-- Ensure your schema for email is `email String? @unique`
-- CREATE UNIQUE INDEX IF NOT EXISTS "Auth_email_key" ON "Auth"("email"); -- Only if truly needed / not handled

-- Create unique index for the new username column
CREATE UNIQUE INDEX "Auth_username_key" ON "Auth"("username");
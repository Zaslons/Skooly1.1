-- Membership-first auth: allow same profile row on multiple SchoolMembership rows;
-- optional Teacher/Parent schoolId; indexes; at most one active student membership per auth.

-- Drop unique indexes on profile FKs (same teacher/parent can link multiple memberships)
DROP INDEX IF EXISTS "SchoolMembership_adminId_key";
DROP INDEX IF EXISTS "SchoolMembership_teacherId_key";
DROP INDEX IF EXISTS "SchoolMembership_studentId_key";
DROP INDEX IF EXISTS "SchoolMembership_parentId_key";

CREATE INDEX IF NOT EXISTS "SchoolMembership_adminId_idx" ON "SchoolMembership"("adminId");
CREATE INDEX IF NOT EXISTS "SchoolMembership_teacherId_idx" ON "SchoolMembership"("teacherId");
CREATE INDEX IF NOT EXISTS "SchoolMembership_studentId_idx" ON "SchoolMembership"("studentId");
CREATE INDEX IF NOT EXISTS "SchoolMembership_parentId_idx" ON "SchoolMembership"("parentId");

-- Teacher / Parent primary school optional (tenant access via SchoolMembership)
ALTER TABLE "Teacher" ALTER COLUMN "schoolId" DROP NOT NULL;
ALTER TABLE "Parent" ALTER COLUMN "schoolId" DROP NOT NULL;

-- At most one active student-role membership per auth
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolMembership_one_active_student_per_auth"
ON "SchoolMembership" ("authId")
WHERE role = 'student' AND "isActive" = true;

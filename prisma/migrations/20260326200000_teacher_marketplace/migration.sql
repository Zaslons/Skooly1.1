-- CreateEnum
CREATE TYPE "MarketplaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ReviewerRole" AS ENUM ('SCHOOL', 'TEACHER');

-- CreateTable
CREATE TABLE "TeacherMarketplaceProfile" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "yearsOfExp" INTEGER,
    "hourlyRate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "subjectTags" TEXT[],
    "availableDays" TEXT[],
    "maxHoursPerWeek" INTEGER,
    "city" TEXT,
    "country" TEXT DEFAULT 'Morocco',
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "offersOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherMarketplaceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMarketplaceSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolMarketplaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceInvitation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "MarketplaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "proposedHoursPerWeek" INTEGER,
    "proposedHourlyRate" DOUBLE PRECISION,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceEngagement" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "membershipId" TEXT,
    "status" "EngagementStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "agreedHoursPerWeek" INTEGER,
    "agreedHourlyRate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "totalHoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "reviewerRole" "ReviewerRole" NOT NULL,
    "reviewerAuthId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMarketplaceNeed" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subjectTags" TEXT[],
    "hoursPerWeek" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolMarketplaceNeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherMarketplaceProfile_teacherId_key" ON "TeacherMarketplaceProfile"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMarketplaceSettings_schoolId_key" ON "SchoolMarketplaceSettings"("schoolId");

-- CreateIndex
CREATE INDEX "MarketplaceInvitation_teacherId_status_idx" ON "MarketplaceInvitation"("teacherId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceInvitation_schoolId_status_idx" ON "MarketplaceInvitation"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceEngagement_invitationId_key" ON "MarketplaceEngagement"("invitationId");

-- CreateIndex
CREATE INDEX "MarketplaceEngagement_teacherId_status_idx" ON "MarketplaceEngagement"("teacherId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceEngagement_schoolId_status_idx" ON "MarketplaceEngagement"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReview_engagementId_reviewerRole_key" ON "MarketplaceReview"("engagementId", "reviewerRole");

-- CreateIndex
CREATE INDEX "SchoolMarketplaceNeed_schoolId_idx" ON "SchoolMarketplaceNeed"("schoolId");

-- AddForeignKey
ALTER TABLE "TeacherMarketplaceProfile" ADD CONSTRAINT "TeacherMarketplaceProfile_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMarketplaceSettings" ADD CONSTRAINT "SchoolMarketplaceSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEngagement" ADD CONSTRAINT "MarketplaceEngagement_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "MarketplaceInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEngagement" ADD CONSTRAINT "MarketplaceEngagement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEngagement" ADD CONSTRAINT "MarketplaceEngagement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "MarketplaceEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMarketplaceNeed" ADD CONSTRAINT "SchoolMarketplaceNeed_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

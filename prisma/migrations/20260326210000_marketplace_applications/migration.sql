-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'REVIEWED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "MarketplaceApplication" (
    "id" TEXT NOT NULL,
    "needId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceApplication_teacherId_idx" ON "MarketplaceApplication"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceApplication_needId_teacherId_key" ON "MarketplaceApplication"("needId", "teacherId");

-- AddForeignKey
ALTER TABLE "MarketplaceApplication" ADD CONSTRAINT "MarketplaceApplication_needId_fkey" FOREIGN KEY ("needId") REFERENCES "SchoolMarketplaceNeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceApplication" ADD CONSTRAINT "MarketplaceApplication_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

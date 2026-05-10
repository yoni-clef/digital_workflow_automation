/*
  Warnings:

  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ManagerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "RequestAuditLog" DROP CONSTRAINT "RequestAuditLog_requestId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "departmentHeadId" TEXT,
ADD COLUMN     "hasRequestedManager" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managerRequestCreatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ManagerRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedManagerId" TEXT,
    "status" "ManagerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,

    CONSTRAINT "ManagerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagerRequest_userId_key" ON "ManagerRequest"("userId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentHeadId_fkey" FOREIGN KEY ("departmentHeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerRequest" ADD CONSTRAINT "ManagerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerRequest" ADD CONSTRAINT "ManagerRequest_requestedManagerId_fkey" FOREIGN KEY ("requestedManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerRequest" ADD CONSTRAINT "ManagerRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAuditLog" ADD CONSTRAINT "RequestAuditLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkflowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

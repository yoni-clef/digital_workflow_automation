/*
  Warnings:

  - The values [REQUEST,REVIEW,APPROVE,ARCHIVE] on the enum `RequestStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [REVIEWER,APPROVER] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "RequestStatus_new" AS ENUM ('PENDING_MANAGER', 'PENDING_DEPARTMENT', 'NEEDS_INFO', 'APPROVED', 'ARCHIVED', 'REJECTED');
ALTER TABLE "public"."WorkflowRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WorkflowRequest" ALTER COLUMN "status" TYPE "RequestStatus_new" USING ("status"::text::"RequestStatus_new");
ALTER TABLE "RequestAuditLog" ALTER COLUMN "fromStatus" TYPE "RequestStatus_new" USING ("fromStatus"::text::"RequestStatus_new");
ALTER TABLE "RequestAuditLog" ALTER COLUMN "toStatus" TYPE "RequestStatus_new" USING ("toStatus"::text::"RequestStatus_new");
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
DROP TYPE "public"."RequestStatus_old";
ALTER TABLE "WorkflowRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING_MANAGER';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDepartmentHead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managerId" TEXT;

-- AlterTable
ALTER TABLE "WorkflowRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING_MANAGER';

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

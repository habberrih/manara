-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING';

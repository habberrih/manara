/*
  Warnings:

  - You are about to drop the column `createdAt` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `keyHash` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `lastUsedAt` on the `api_keys` table. All the data in the column will be lost.
  - You are about to drop the column `organizationId` on the `api_keys` table. All the data in the column will be lost.
  - The primary key for the `memberships` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `organizationId` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `memberships` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `organizations` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `organizations` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `currentPeriodEnd` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `organizationId` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `providerCustomerId` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `providerSubId` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isSuperAdmin` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[key_hash]` on the table `api_keys` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider_sub_id]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `key_hash` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `api_keys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `memberships` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `memberships` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `memberships` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `organizations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `current_period_end` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider_customer_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider_sub_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."api_keys" DROP CONSTRAINT "api_keys_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."memberships" DROP CONSTRAINT "memberships_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."memberships" DROP CONSTRAINT "memberships_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."subscriptions" DROP CONSTRAINT "subscriptions_organizationId_fkey";

-- DropIndex
DROP INDEX "public"."api_keys_keyHash_key";

-- DropIndex
DROP INDEX "public"."api_keys_organizationId_idx";

-- DropIndex
DROP INDEX "public"."memberships_organizationId_idx";

-- DropIndex
DROP INDEX "public"."subscriptions_organizationId_idx";

-- DropIndex
DROP INDEX "public"."subscriptions_providerSubId_key";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "createdAt",
DROP COLUMN "keyHash",
DROP COLUMN "lastUsedAt",
DROP COLUMN "organizationId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "key_hash" TEXT NOT NULL,
ADD COLUMN     "last_used_at" TIMESTAMP(3),
ADD COLUMN     "organization_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "organizationId",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "organization_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id", "organization_id");

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "createdAt",
DROP COLUMN "currentPeriodEnd",
DROP COLUMN "organizationId",
DROP COLUMN "providerCustomerId",
DROP COLUMN "providerSubId",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "current_period_end" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "organization_id" TEXT NOT NULL,
ADD COLUMN     "provider_customer_id" TEXT NOT NULL,
ADD COLUMN     "provider_sub_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "createdAt",
DROP COLUMN "isSuperAdmin",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refresh_token" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_sub_id_key" ON "subscriptions"("provider_sub_id");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions"("organization_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

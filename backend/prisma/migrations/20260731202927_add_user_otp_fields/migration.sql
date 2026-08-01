-- AlterTable
ALTER TABLE "users" ADD COLUMN     "otp_code_hash" TEXT,
ADD COLUMN     "otp_expires_at" TIMESTAMP(3);

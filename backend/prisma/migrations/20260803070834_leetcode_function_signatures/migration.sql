-- AlterTable
ALTER TABLE "coding_problems" ADD COLUMN     "function_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "parameters" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "return_type" TEXT NOT NULL DEFAULT '';

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'coding';

-- AlterTable
ALTER TABLE "attempt_answers" ADD COLUMN     "code_language" TEXT,
ADD COLUMN     "submitted_code" TEXT;

-- CreateTable
CREATE TABLE "coding_problems" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "constraints" TEXT,
    "time_limit_ms" INTEGER NOT NULL DEFAULT 2000,
    "memory_limit_mb" INTEGER NOT NULL DEFAULT 256,
    "allowed_languages" TEXT[],
    "starter_code" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "coding_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coding_test_cases" (
    "id" TEXT NOT NULL,
    "coding_problem_id" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "points" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "coding_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coding_problems_question_id_key" ON "coding_problems"("question_id");

-- AddForeignKey
ALTER TABLE "coding_problems" ADD CONSTRAINT "coding_problems_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_test_cases" ADD CONSTRAINT "coding_test_cases_coding_problem_id_fkey" FOREIGN KEY ("coding_problem_id") REFERENCES "coding_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

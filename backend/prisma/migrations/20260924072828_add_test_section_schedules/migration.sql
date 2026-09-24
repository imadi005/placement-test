-- CreateTable
CREATE TABLE "test_section_schedules" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_section_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_section_schedules_test_id_section_key" ON "test_section_schedules"("test_id", "section");

-- AddForeignKey
ALTER TABLE "test_section_schedules" ADD CONSTRAINT "test_section_schedules_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

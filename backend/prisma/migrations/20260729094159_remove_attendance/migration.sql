-- DropForeignKey
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_class_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_marked_by_fkey";

-- DropForeignKey
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_student_id_fkey";

-- DropTable
DROP TABLE "attendance";

-- DropEnum
DROP TYPE "AttendanceStatus";

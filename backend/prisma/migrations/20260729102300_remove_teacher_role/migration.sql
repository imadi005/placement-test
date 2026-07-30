-- DropForeignKey
ALTER TABLE "teacher_class_assignments" DROP CONSTRAINT "teacher_class_assignments_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "teachers" DROP CONSTRAINT "teachers_user_id_fkey";

-- DropTable
DROP TABLE "teacher_class_assignments";

-- DropTable
DROP TABLE "teachers";

-- Remove any teacher-role users before narrowing the Role enum below —
-- the enum USING cast fails if any existing row still holds a value that
-- won't exist in the new type.
DELETE FROM "users" WHERE "role" = 'teacher';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('student', 'coordinator', 'admin');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;

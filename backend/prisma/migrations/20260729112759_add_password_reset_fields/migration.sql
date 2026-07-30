-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reset_token" TEXT,
ADD COLUMN     "reset_token_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");

-- Every row that already exists at this point was seeded as a demo account
-- before this column existed — they're documented logins (README/HANDOFF),
-- not real first-time provisioning, so they shouldn't hit the forced
-- change-password screen. New accounts created after this migration keep
-- the column default (true).
UPDATE "users" SET "must_change_password" = false;

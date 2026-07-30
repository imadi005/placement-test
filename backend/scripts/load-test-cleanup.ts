import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Removes everything created by load-test-seed.ts: the dedicated test (and
// its questions/attempts/answers/violations) plus every loadtest-* user.
// Run with: npx ts-node scripts/load-test-cleanup.ts
const prisma = new PrismaClient();

async function main() {
  const dataPath = path.join(__dirname, "load-test-data.json");
  if (!fs.existsSync(dataPath)) {
    console.log("No load-test-data.json found — nothing to clean up.");
    return;
  }
  const { testId } = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const attempts = await prisma.testAttempt.findMany({ where: { testId }, select: { id: true } });
  const attemptIds = attempts.map((a) => a.id);

  await prisma.violation.deleteMany({ where: { attemptId: { in: attemptIds } } });
  await prisma.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
  await prisma.testAttempt.deleteMany({ where: { testId } });

  const questions = await prisma.question.findMany({ where: { testId }, select: { id: true } });
  const questionIds = questions.map((q) => q.id);
  await prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.question.deleteMany({ where: { testId } });
  await prisma.test.delete({ where: { id: testId } });

  const { count: studentCount } = await prisma.student.deleteMany({
    where: { userId: { startsWith: "loadtest-" } },
  });
  const { count: userCount } = await prisma.user.deleteMany({
    where: { id: { startsWith: "loadtest-" } },
  });

  fs.unlinkSync(dataPath);
  console.log(`Deleted test ${testId}, ${attemptIds.length} attempts, ${studentCount} students, ${userCount} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

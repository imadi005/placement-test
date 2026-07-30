import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";

// Creates a self-contained load-test fixture: N dedicated student accounts
// (never mixed with the real KJU roster) plus one live test they can all
// see, scoped batchScope "ALL". Run with: npx ts-node scripts/load-test-seed.ts
// Clean up afterwards with: npx ts-node scripts/load-test-cleanup.ts
const STUDENT_COUNT = Number(process.env.LOAD_TEST_STUDENTS ?? 1200);
const EMAIL_DOMAIN = "loadtest.internal"; // marker used by the cleanup script
const PASSWORD = "LoadTest123!";

const prisma = new PrismaClient();

async function main() {
  const coordinator = await prisma.user.findFirst({ where: { role: "coordinator" } });
  if (!coordinator) {
    throw new Error("No coordinator user found — run the main prisma seed first.");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const batchCycle: ("A" | "B" | "C")[] = ["A", "B", "C"];

  const users = Array.from({ length: STUDENT_COUNT }, (_, i) => {
    const n = String(i + 1).padStart(5, "0");
    return {
      id: `loadtest-${n}`,
      email: `loadtest${n}@${EMAIL_DOMAIN}`,
      passwordHash,
      role: "student" as const,
      fullName: `Load Test Student ${n}`,
      mustChangePassword: false,
    };
  });
  const students = users.map((u, i) => ({
    userId: u.id,
    rollNo: `LOADTEST${String(i + 1).padStart(5, "0")}`,
    batch: batchCycle[i % 3],
    section: "LOADTEST",
    currentSemester: 1,
  }));

  console.log(`Seeding ${STUDENT_COUNT} load-test students...`);
  await prisma.user.createMany({ data: users, skipDuplicates: true });
  await prisma.student.createMany({ data: students, skipDuplicates: true });

  const test = await prisma.test.create({
    data: {
      title: "LOAD TEST — do not use for real students",
      batchScope: "ALL",
      durationMinutes: 60,
      scheduledStart: new Date(),
      status: "live",
      approved: true,
      createdById: coordinator.id,
    },
  });

  const questionBank = [
    { text: "2 + 2 * 2 = ?", options: ["4", "6", "8", "16"], correct: 1 },
    { text: "Next in the sequence 1, 4, 9, 16, ?", options: ["20", "25", "24", "30"], correct: 1 },
    { text: "A train covers 60km in 1.5 hours. Its speed?", options: ["30 km/h", "40 km/h", "45 km/h", "60 km/h"], correct: 1 },
    { text: "Odd one out: Dog, Cat, Lion, Snake", options: ["Dog", "Cat", "Lion", "Snake"], correct: 3 },
    { text: "If A=1, B=2, ... what is J?", options: ["9", "10", "11", "12"], correct: 1 },
  ];
  for (let i = 0; i < questionBank.length; i++) {
    const q = questionBank[i];
    await prisma.question.create({
      data: {
        testId: test.id,
        questionOrder: i + 1,
        questionType: "mcq",
        questionText: q.text,
        options: {
          create: q.options.map((optionText, idx) => ({ optionText, isCorrect: idx === q.correct })),
        },
      },
    });
  }

  const outPath = path.join(__dirname, "load-test-data.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        testId: test.id,
        password: PASSWORD,
        students: students.map((s) => ({ rollNo: s.rollNo })),
      },
      null,
      2
    )
  );

  console.log(`Done. Test id: ${test.id}`);
  console.log(`Wrote ${outPath} for the k6 script to consume.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

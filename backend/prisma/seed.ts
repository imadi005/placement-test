import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Run with: npx prisma db seed
// Password for EVERY seeded account: Password123!
//
// Student roster is REAL data (315 students) extracted and cleaned from
// KJU's actual "I_YEAR_PG_Placement_Training_-_Batch_Wise.xlsx" — see
// ../sample-data/kju-real-data-extract.xlsx for the cleaned extraction and
// its Notes sheet for the two anomalies found in the source file.
//
// Two things here are NOT from the source data and are placeholders:
// 1. `batch` (A/B/C) — this is our platform's own score-based performance
//    batch, which doesn't exist in the source file at all (that file only
//    has academic Section: MCA A/B/C/D, MSc DS, MSc CS — stored in
//    `student.section`). Assigned round-robin here purely so the batch
//    upgrade/downgrade feature and batch-scoped tests have something to
//    demo against — replace with real batches once actual test scores exist.
// 2. Class assignments — the source spreadsheet's weekly "training groups"
//    (Group A, B (Batch 1), C (Batch 2), etc.) mix students from every
//    academic section together for one training slot, which doesn't map
//    cleanly onto this schema's one-class-one-section model. Rather than
//    force a bad fit, this seed creates a small, honest set of class
//    assignments against real academic sections instead of trying to
//    reproduce the training-group structure faithfully.
async function main() {
  const password = await bcrypt.hash("Password123!", 12);

  // ===== Staff (real faculty names from the schedule's "Faculty Assignments" sheet) =====
  const coordinator = await prisma.user.create({
    data: { email: "priya.menon@kju.edu", passwordHash: password, role: "coordinator", fullName: "Priya Menon" },
  });
  const admin = await prisma.user.create({
    data: { email: "r.iyer@kju.edu", passwordHash: password, role: "admin", fullName: "Ramesh Iyer" },
  });
  const teacherVimala = await prisma.user.create({
    data: {
      email: "vimala@kju.edu",
      passwordHash: password,
      role: "teacher",
      fullName: "Dr Vimala",
      teacher: { create: { department: "MCA" } },
    },
  });
  const teacherVinothina = await prisma.user.create({
    data: {
      email: "vinothina@kju.edu",
      passwordHash: password,
      role: "teacher",
      fullName: "Dr Vinothina",
      teacher: { create: { department: "MCA" } },
    },
  });

  // ===== Real student roster (315 students) — bulk-inserted for speed =====
  const rosterPath = path.join(__dirname, "data", "students-real.json");
  const roster: { name: string; rollNo: string; section: string }[] = JSON.parse(
    fs.readFileSync(rosterPath, "utf-8")
  );

  const batchCycle: ("A" | "B" | "C")[] = ["A", "B", "C"];
  const userRows = roster.map((s, i) => ({
    id: randomUUID(),
    email: `${s.rollNo.toLowerCase()}@kristujayanti.com`, // matches the real convention seen in the source file
    passwordHash: password,
    role: "student" as const,
    fullName: s.name,
  }));
  const studentRows = roster.map((s, i) => ({
    userId: userRows[i].id,
    rollNo: s.rollNo,
    batch: batchCycle[i % 3], // placeholder — see note above
    section: s.section,
    currentSemester: 1,
  }));

  // createMany can't do nested writes, so users and students are inserted
  // as two flat bulk operations sharing the same generated ids — far faster
  // than 315 sequential prisma.user.create() calls with nested `student.create`.
  await prisma.user.createMany({ data: userRows });
  await prisma.student.createMany({ data: studentRows });

  // ===== One real class assignment against a real academic section =====
  await prisma.teacherClassAssignment.create({
    data: { teacherId: teacherVimala.id, section: "MCA A", subject: "Aptitude", dayOfWeek: 2, startTime: "15:40", endTime: "16:30" },
  });
  await prisma.teacherClassAssignment.create({
    data: { teacherId: teacherVinothina.id, section: "MCA B", subject: "Programming Fundamentals", dayOfWeek: 2, startTime: "15:40", endTime: "16:30" },
  });

  // ===== One live test, scoped to placeholder batch A =====
  const test = await prisma.test.create({
    data: {
      title: "Weekly Aptitude Test — Numbers & Logic",
      batchScope: "A",
      durationMinutes: 30,
      scheduledStart: new Date(),
      status: "live",
      approved: true,
      createdById: coordinator.id,
    },
  });

  await prisma.question.create({
    data: {
      testId: test.id,
      questionOrder: 1,
      questionType: "mcq",
      questionText:
        "If a sequence is defined so each term is the sum of the two preceding terms, and the first two terms are 3 and 5, what is the 6th term?",
      options: {
        create: [
          { optionText: "21", isCorrect: false },
          { optionText: "34", isCorrect: true },
          { optionText: "48", isCorrect: false },
          { optionText: "55", isCorrect: false },
        ],
      },
    },
  });

  await prisma.question.create({
    data: {
      testId: test.id,
      questionOrder: 2,
      questionType: "descriptive",
      questionText:
        "Explain, in your own words, how you would approach solving a work-and-time problem involving three people working at different rates.",
      modelAnswer:
        "Find each person's individual rate (work/time), sum the rates for combined work per unit time, then take the reciprocal of the combined rate to get total time.",
    },
  });

  // ===== One batch upgrade on a real student, for a real audit-trail demo =====
  const firstBatchAStudentIdx = studentRows.findIndex((s) => s.batch === "A");
  if (firstBatchAStudentIdx !== -1) {
    const upgradedUserId = studentRows[firstBatchAStudentIdx].userId;
    await prisma.batchHistory.create({
      data: {
        studentId: upgradedUserId,
        oldBatch: "C",
        newBatch: "A",
        changedById: coordinator.id,
        reason: "Demo record — real batch history will follow actual test performance",
      },
    });
  }

  const sectionCounts = roster.reduce<Record<string, number>>((acc, s) => {
    acc[s.section] = (acc[s.section] ?? 0) + 1;
    return acc;
  }, {});

  console.log("Seeded demo dataset (password for every account: Password123!):\n");
  console.log("Staff:");
  console.log("  coordinator:", coordinator.email);
  console.log("  admin:      ", admin.email);
  console.log("  teacher:    ", teacherVimala.email, "(Aptitude, MCA A)");
  console.log("  teacher:    ", teacherVinothina.email, "(Programming Fundamentals, MCA B)");
  console.log(`\n${roster.length} real students seeded across sections:`, sectionCounts);
  console.log("\nLog in as any student with their roll number, e.g.:", roster[0].rollNo, "/ Password123!");
  console.log("A live test is ready to take: 'Weekly Aptitude Test — Numbers & Logic' (placeholder batch A)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

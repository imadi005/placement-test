import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Run with: npx prisma db seed
// Every account uses password: Password123! — this is a realistic demo
// dataset (multiple teachers, students spread across all three batches,
// a full ready-to-take test, attendance history, one batch upgrade on
// record) so the app looks and behaves like a real deployment rather than
// a single lonely test user each. Change/remove all of this before any
// real deployment — it's local dev only.
async function main() {
  const password = await bcrypt.hash("Password123!", 12);

  // ===== Staff =====
  const coordinator = await prisma.user.create({
    data: { email: "priya.menon@kju.edu", passwordHash: password, role: "coordinator", fullName: "Priya Menon" },
  });
  const admin = await prisma.user.create({
    data: { email: "r.iyer@kju.edu", passwordHash: password, role: "admin", fullName: "Ramesh Iyer" },
  });
  const teacherAnitha = await prisma.user.create({
    data: {
      email: "anitha.rao@kju.edu",
      passwordHash: password,
      role: "teacher",
      fullName: "Anitha Rao",
      teacher: { create: { department: "MCA" } },
    },
  });
  const teacherSuresh = await prisma.user.create({
    data: {
      email: "suresh.kumar@kju.edu",
      passwordHash: password,
      role: "teacher",
      fullName: "Suresh Kumar",
      teacher: { create: { department: "MCA" } },
    },
  });

  // ===== Students across all three batches =====
  const studentData = [
    { email: "aditya.s@kju.edu", fullName: "Aditya Sharma", rollNo: "25MCAB58", batch: "A" as const },
    { email: "meera.k@kju.edu", fullName: "Meera Krishnan", rollNo: "25MCAB12", batch: "A" as const },
    { email: "rahul.v@kju.edu", fullName: "Rahul Verma", rollNo: "25MCAB27", batch: "B" as const },
    { email: "sneha.p@kju.edu", fullName: "Sneha Pillai", rollNo: "25MCAB33", batch: "C" as const }, // upgraded to B below
    { email: "arjun.n@kju.edu", fullName: "Arjun Nair", rollNo: "25MCAB41", batch: "C" as const },
    { email: "divya.t@kju.edu", fullName: "Divya Thomas", rollNo: "25MCAB05", batch: "C" as const },
  ];

  const students = [];
  for (const s of studentData) {
    const user = await prisma.user.create({
      data: {
        email: s.email,
        passwordHash: password,
        role: "student",
        fullName: s.fullName,
        student: { create: { rollNo: s.rollNo, batch: s.batch, section: "A1", currentSemester: 3 } },
      },
    });
    students.push(user);
  }
  const [aditya, meera, rahul, sneha, arjun, divya] = students;

  // ===== Class assignments — two subjects, two teachers, same section =====
  const aptitudeClass = await prisma.teacherClassAssignment.create({
    data: { teacherId: teacherAnitha.id, section: "A1", subject: "Aptitude", dayOfWeek: 2, startTime: "10:00", endTime: "11:00" },
  });
  await prisma.teacherClassAssignment.create({
    data: { teacherId: teacherSuresh.id, section: "A1", subject: "Logical Reasoning", dayOfWeek: 4, startTime: "11:00", endTime: "12:00" },
  });

  // ===== Three weeks of attendance for the Aptitude class =====
  const attendanceRows: { studentId: string; date: string; status: "present" | "absent" | "excused" }[] = [
    { studentId: aditya.id, date: "2026-07-08", status: "present" },
    { studentId: aditya.id, date: "2026-07-15", status: "present" },
    { studentId: aditya.id, date: "2026-07-22", status: "absent" },
    { studentId: meera.id, date: "2026-07-08", status: "present" },
    { studentId: meera.id, date: "2026-07-15", status: "absent" },
    { studentId: meera.id, date: "2026-07-22", status: "present" },
    { studentId: rahul.id, date: "2026-07-08", status: "present" },
    { studentId: rahul.id, date: "2026-07-15", status: "present" },
    { studentId: rahul.id, date: "2026-07-22", status: "excused" },
  ];
  for (const row of attendanceRows) {
    await prisma.attendance.create({
      data: {
        studentId: row.studentId,
        classAssignmentId: aptitudeClass.id,
        date: new Date(row.date),
        status: row.status,
        markedById: teacherAnitha.id,
      },
    });
  }

  // ===== A real, live, ready-to-take test with mixed MCQ + descriptive =====
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

  const q1 = await prisma.question.create({
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
      questionType: "mcq",
      questionText: "A train 120m long crosses a pole in 6 seconds. What is its speed in km/h?",
      options: {
        create: [
          { optionText: "60 km/h", isCorrect: false },
          { optionText: "72 km/h", isCorrect: true },
          { optionText: "80 km/h", isCorrect: false },
          { optionText: "90 km/h", isCorrect: false },
        ],
      },
    },
  });

  await prisma.question.create({
    data: {
      testId: test.id,
      questionOrder: 3,
      questionType: "descriptive",
      questionText:
        "Explain, in your own words, how you would approach solving a work-and-time problem involving three people working at different rates.",
      modelAnswer:
        "Find each person's individual rate (work/time), sum the rates for combined work per unit time, then take the reciprocal of the combined rate to get total time.",
    },
  });

  // ===== One batch upgrade on record — proves the audit trail works =====
  await prisma.batchHistory.create({
    data: {
      studentId: sneha.id,
      oldBatch: "C",
      newBatch: "B",
      changedById: coordinator.id,
      reason: "Scored 88% on Weekly Aptitude Test #3, moved up from C to B",
    },
  });
  await prisma.student.update({ where: { userId: sneha.id }, data: { batch: "B" } });

  console.log("Seeded demo dataset (password for every account: Password123!):\n");
  console.log("Staff:");
  console.log("  coordinator:", coordinator.email);
  console.log("  admin:      ", admin.email);
  console.log("  teacher:    ", teacherAnitha.email, "(Aptitude, section A1)");
  console.log("  teacher:    ", teacherSuresh.email, "(Logical Reasoning, section A1)");
  console.log("\nStudents:");
  for (const s of studentData) console.log(`  ${s.rollNo}  batch ${s.batch === "C" && s.email === sneha.email ? "C→B (upgraded)" : s.batch}  ${s.email}`);
  console.log("\nA live test is ready to take: 'Weekly Aptitude Test — Numbers & Logic' (batch A, question 1 id:", q1.id, ")");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

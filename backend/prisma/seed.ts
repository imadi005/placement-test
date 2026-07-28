import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Run with: npx prisma db seed
// Gives you one working login per role — change these passwords before any
// real deployment, this file is for local dev only.
async function main() {
  const password = await bcrypt.hash("Password123!", 12);

  const student = await prisma.user.create({
    data: {
      email: "student.test@kju.edu",
      passwordHash: password,
      role: "student",
      fullName: "Test Student",
      student: {
        create: { rollNo: "25MCAB01", batch: "A", section: "A1", currentSemester: 3 },
      },
    },
  });

  const teacher = await prisma.user.create({
    data: {
      email: "teacher.test@kju.edu",
      passwordHash: password,
      role: "teacher",
      fullName: "Test Teacher",
      teacher: { create: { department: "MCA" } },
    },
  });

  const coordinator = await prisma.user.create({
    data: {
      email: "coordinator.test@kju.edu",
      passwordHash: password,
      role: "coordinator",
      fullName: "Test Coordinator",
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: "admin.test@kju.edu",
      passwordHash: password,
      role: "admin",
      fullName: "Test Admin",
    },
  });

  console.log("Seeded test accounts (password for all: Password123!):");
  console.log("  student:     roll no 25MCAB01  /", student.email);
  console.log("  teacher:    ", teacher.email);
  console.log("  coordinator:", coordinator.email);
  console.log("  admin:      ", admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

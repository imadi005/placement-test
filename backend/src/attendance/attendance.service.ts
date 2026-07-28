import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TeacherClassesService } from "../teacher-classes/teacher-classes.service";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto";

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private teacherClasses: TeacherClassesService
  ) {}

  // RBAC matrix §8: teacher — "mark/update attendance for their own classes
  // only". Ownership is enforced here, not trusted from the request body —
  // a teacher can never mark attendance for a class assigned to someone else.
  async markForClass(classAssignmentId: string, teacherId: string, dto: MarkAttendanceDto) {
    await this.teacherClasses.assertOwnedByTeacher(classAssignmentId, teacherId);

    const date = new Date(dto.date);

    return this.prisma.$transaction(
      dto.records.map((record) =>
        this.prisma.attendance.upsert({
          where: {
            studentId_classAssignmentId_date: {
              studentId: record.studentId,
              classAssignmentId,
              date,
            },
          },
          create: {
            studentId: record.studentId,
            classAssignmentId,
            date,
            status: record.status as any,
            markedById: teacherId,
          },
          update: {
            status: record.status as any,
            markedById: teacherId,
          },
        })
      )
    );
  }

  async getForClassOnDate(classAssignmentId: string, teacherId: string, date: string) {
    await this.teacherClasses.assertOwnedByTeacher(classAssignmentId, teacherId);
    return this.prisma.attendance.findMany({
      where: { classAssignmentId, date: new Date(date) },
      include: { student: { include: { user: { select: { fullName: true } } } } },
    });
  }

  // Student's own dashboard widget (or coordinator/admin looking up a
  // specific student) — per-class percentage plus an overall figure.
  async getStudentSummary(studentId: string) {
    const records = await this.prisma.attendance.findMany({
      where: { studentId },
      include: { classAssignment: true },
    });

    const byClass = new Map<string, { subject: string; present: number; total: number }>();
    let overallPresent = 0;
    let overallCountable = 0;

    for (const r of records) {
      if (r.status === "excused") continue; // excused doesn't count against the denominator
      const key = r.classAssignmentId;
      const bucket = byClass.get(key) ?? { subject: r.classAssignment.subject, present: 0, total: 0 };
      bucket.total += 1;
      if (r.status === "present") bucket.present += 1;
      byClass.set(key, bucket);

      overallCountable += 1;
      if (r.status === "present") overallPresent += 1;
    }

    const perClass = Array.from(byClass.entries()).map(([classAssignmentId, v]) => ({
      classAssignmentId,
      subject: v.subject,
      present: v.present,
      total: v.total,
      percentage: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
    }));

    return {
      perClass,
      overallPercentage: overallCountable > 0 ? Math.round((overallPresent / overallCountable) * 100) : 0,
    };
  }

  // Coordinator view: attendance % per class + which teacher takes it —
  // design doc RBAC §8, "shows the attendance ... which teacher is taking
  // which class, the attendance %".
  async getSectionSummary() {
    const assignments = await this.prisma.teacherClassAssignment.findMany({
      include: { teacher: { include: { user: { select: { fullName: true } } } } },
    });

    const summaries = await Promise.all(
      assignments.map(async (a) => {
        const records = await this.prisma.attendance.findMany({
          where: { classAssignmentId: a.id, status: { not: "excused" } },
        });
        const present = records.filter((r) => r.status === "present").length;
        const percentage = records.length > 0 ? Math.round((present / records.length) * 100) : 0;

        return {
          classAssignmentId: a.id,
          section: a.section,
          subject: a.subject,
          teacherName: a.teacher.user.fullName,
          attendancePercentage: percentage,
        };
      })
    );

    return summaries;
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClassAssignmentDto } from "./dto/create-class-assignment.dto";

@Injectable()
export class TeacherClassesService {
  constructor(private prisma: PrismaService) {}

  // Coordinator/admin sets up who teaches what, when — not the teacher
  // themselves (RBAC matrix §8: teacher only "views own calendar").
  async create(dto: CreateClassAssignmentDto) {
    return this.prisma.teacherClassAssignment.create({ data: dto });
  }

  // The teacher's own calendar — design doc: "view own calendar".
  async findForTeacher(teacherId: string) {
    return this.prisma.teacherClassAssignment.findMany({
      where: { teacherId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }

  // Coordinator's "which teacher takes which class" view.
  async findAll() {
    return this.prisma.teacherClassAssignment.findMany({
      include: { teacher: { include: { user: { select: { fullName: true } } } } },
      orderBy: [{ section: "asc" }, { dayOfWeek: "asc" }],
    });
  }

  async findOne(id: string) {
    const assignment = await this.prisma.teacherClassAssignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException("Class assignment not found");
    return assignment;
  }

  async assertOwnedByTeacher(classAssignmentId: string, teacherId: string) {
    const assignment = await this.findOne(classAssignmentId);
    if (assignment.teacherId !== teacherId) {
      throw new NotFoundException("Class assignment not found"); // don't leak existence to a non-owner
    }
    return assignment;
  }
}

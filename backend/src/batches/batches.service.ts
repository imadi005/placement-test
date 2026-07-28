import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChangeBatchDto } from "./dto/change-batch.dto";

@Injectable()
export class BatchesService {
  constructor(private prisma: PrismaService) {}

  // Never update students.batch directly — always write batch_history first,
  // in the same transaction, per system-design/...md §3. This is the only
  // place a student's batch should ever change.
  async changeBatch(dto: ChangeBatchDto, changedById: string) {
    const student = await this.prisma.student.findUnique({ where: { userId: dto.studentId } });
    if (!student) throw new NotFoundException("Student not found");

    return this.prisma.$transaction(async (tx) => {
      await tx.batchHistory.create({
        data: {
          studentId: dto.studentId,
          oldBatch: student.batch,
          newBatch: dto.newBatch,
          changedById,
          reason: dto.reason,
          relatedTestId: dto.relatedTestId,
        },
      });

      const updated = await tx.student.update({
        where: { userId: dto.studentId },
        data: { batch: dto.newBatch },
      });

      await tx.auditLog.create({
        data: {
          actorId: changedById,
          action: "batch_change",
          targetType: "student",
          targetId: dto.studentId,
        },
      });

      return updated;
    });
  }

  async historyForStudent(studentId: string) {
    return this.prisma.batchHistory.findMany({
      where: { studentId },
      orderBy: { changedAt: "desc" },
    });
  }
}

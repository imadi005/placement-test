import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTestDto } from "./dto/create-test.dto";

@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTestDto, createdById: string) {
    return this.prisma.test.create({
      data: {
        title: dto.title,
        batchScope: dto.batchScope,
        durationMinutes: dto.durationMinutes,
        scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : null,
        createdById,
        status: "draft",
        approved: false,
      },
    });
  }

  async findOne(id: string) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: { questions: { include: { options: true }, orderBy: { questionOrder: "asc" } } },
    });
    if (!test) throw new NotFoundException("Test not found");
    return test;
  }

  // Coordinator/admin listing — everything, any status
  async findAllForStaff() {
    return this.prisma.test.findMany({ orderBy: { scheduledStart: "desc" } });
  }

  // Student listing — only scheduled/live tests scoped to their own batch (or ALL)
  async findVisibleForStudent(batch: string) {
    return this.prisma.test.findMany({
      where: {
        status: { in: ["scheduled", "live"] },
        OR: [{ batchScope: batch }, { batchScope: "ALL" }],
      },
      orderBy: { scheduledStart: "asc" },
    });
  }

  // A test can only move to 'scheduled' once its questions are approved —
  // this is the gate from system-design/...md §10 step 5. Never let a test
  // go live with unreviewed parsed questions attached.
  async schedule(id: string) {
    const test = await this.findOne(id);
    const unapproved = test.questions.length === 0;
    if (unapproved) {
      throw new BadRequestException("Cannot schedule a test with no questions");
    }
    if (!test.approved) {
      throw new BadRequestException("Question set must be approved before scheduling");
    }
    return this.prisma.test.update({ where: { id }, data: { status: "scheduled" } });
  }

  async start(id: string) {
    return this.prisma.test.update({ where: { id }, data: { status: "live" } });
  }

  async stop(id: string) {
    return this.prisma.test.update({ where: { id }, data: { status: "ended" } });
  }

  // Called once the coordinator has reviewed the parsed question bank —
  // flips the approval gate that `schedule()` checks above.
  async markApproved(id: string) {
    return this.prisma.test.update({ where: { id }, data: { approved: true } });
  }
}

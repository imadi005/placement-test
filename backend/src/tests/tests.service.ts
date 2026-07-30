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

  // Lets the coordinator's create-test modal set a schedule time without a
  // full update endpoint — deliberately narrow (one field) rather than a
  // general PATCH, since scheduledStart is the only field that legitimately
  // changes after a test is created in draft.
  async updateScheduledStart(id: string, scheduledStart: string) {
    return this.prisma.test.update({ where: { id }, data: { scheduledStart: new Date(scheduledStart) } });
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

  // Same gate as schedule() — without it, "Start now" on a draft test that
  // was closed out before any questions were committed silently goes live
  // with zero questions, and every student who joins hits a dead end.
  async start(id: string) {
    const test = await this.findOne(id);
    if (test.questions.length === 0) {
      throw new BadRequestException("Cannot start a test with no questions");
    }
    if (!test.approved) {
      throw new BadRequestException("Question set must be approved before starting");
    }
    return this.prisma.test.update({ where: { id }, data: { status: "live" } });
  }

  async stop(id: string) {
    return this.prisma.test.update({ where: { id }, data: { status: "ended" } });
  }

  // Snapshot for the coordinator's live monitoring screen's initial load —
  // real-time updates after this come from the WebSocket gateway's
  // `test:event` relay, this is just what populates the table on page load.
  async getLiveStatus(id: string) {
    const [inProgress, submittedCount, totalEligible] = await Promise.all([
      this.prisma.testAttempt.findMany({
        where: { testId: id, status: "in_progress" },
        include: {
          student: { include: { user: { select: { fullName: true } } } },
          _count: { select: { violations: true } },
        },
      }),
      // Anything past in_progress counts as "submitted" for the summary
      // stat — submitted/auto_submitted/flagged/pending_grading/graded all
      // mean the student is done, regardless of whether grading is final.
      this.prisma.testAttempt.count({ where: { testId: id, status: { not: "in_progress" } } }),
      (async () => {
        const test = await this.prisma.test.findUnique({ where: { id } });
        if (!test) return 0;
        return this.prisma.student.count({
          where: test.batchScope === "ALL" ? {} : { batch: test.batchScope as any },
        });
      })(),
    ]);

    const students = inProgress.map((a) => ({
      attemptId: a.id,
      studentId: a.studentId,
      studentName: a.student.user.fullName,
      section: a.student.section,
      batch: a.student.batch,
      startedAt: a.startedAt,
      violationCount: a._count.violations,
    }));

    return { students, submittedCount, totalEligible };
  }

  // Called once the coordinator has reviewed the parsed question bank —
  // flips the approval gate that `schedule()` checks above. In the current
  // UI this is called automatically right after commit, as part of one
  // Start/Schedule action — there's no separate user-facing "Approve" step.
  async markApproved(id: string) {
    return this.prisma.test.update({ where: { id }, data: { approved: true } });
  }
}

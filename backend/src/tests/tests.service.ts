import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { AttemptsService } from "../attempts/attempts.service";
import { CreateTestDto } from "./dto/create-test.dto";

@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService, private redis: RedisService, private attempts: AttemptsService) {}

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

  // Coordinator/admin listing — everything, any status, most recently
  // created first (not scheduledStart — a just-created draft has no
  // schedule yet and was sorting to the bottom/randomly instead of to top).
  // Every coordinator sees the same shared list — except tests created
  // under the priya.menon@kju.edu demo/test account, which are excluded
  // here so real coordinators aren't seeing dev/QA clutter. That exclusion
  // must not apply when Priya herself is the one asking — she still needs
  // to see (and monitor/schedule) her own tests; `requesterId` is how the
  // controller tells us who's actually looking.
  async findAllForStaff(requesterId?: string) {
    // An empty `{ createdById: undefined }` filter would collapse to "match
    // everything" and defeat the exclusion entirely — only add the
    // self-exception clause when there's an actual id to match.
    const or = requesterId
      ? [{ createdBy: { email: { not: "priya.menon@kju.edu" } } }, { createdById: requesterId }]
      : [{ createdBy: { email: { not: "priya.menon@kju.edu" } } }];

    return this.prisma.test.findMany({
      where: { OR: or },
      orderBy: { createdAt: "desc" },
    });
  }

  // Student listing — only scheduled/live tests scoped to their own section (or ALL)
  async findVisibleForStudent(section: string) {
    return this.prisma.test.findMany({
      where: {
        status: { in: ["scheduled", "live"] },
        OR: [{ batchScope: section }, { batchScope: "ALL" }],
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
    const updated = await this.prisma.test.update({ where: { id }, data: { status: "live", startedAt: new Date() } });
    await this.redis.publishTestEvent(id, { type: "test_status_changed", status: updated.status });
    return updated;
  }

  // Ending the test is also the signal that unlocks each student's answer
  // breakdown and the leaderboard (see attempts.service.ts's getResult() and
  // this file's getLeaderboard() — both gated on status === "ended" so the
  // paper can't leak to students still mid-test). This event is what lets a
  // student already sitting on their results page pick that up live,
  // instead of only finding out on their next manual refresh.
  // Ending the test used to just flip the status column — any attempt
  // still "in_progress" at that moment was left stuck there forever (the
  // exam page's answer/submit calls all require the test to still be
  // "live", so a student mid-exam when this fires has no way to ever
  // submit on their own; no score, invisible to the leaderboard). Now every
  // in-progress attempt is force-submitted at whatever it had answered so
  // far, same as a real submit. Done before the test_status_changed
  // broadcast below, so a student's results page reacting to "ended"
  // always finds a fully-settled leaderboard, not one still mid-update.
  async stop(id: string) {
    const updated = await this.prisma.test.update({ where: { id }, data: { status: "ended" } });
    await this.attempts.submitAllInProgress(id);
    await this.redis.publishTestEvent(id, { type: "test_status_changed", status: updated.status });
    return updated;
  }

  // Cascading delete in FK-safe order: Violation has a RESTRICT relation to
  // TestAttempt, so violations must go first; everything else follows the
  // same dependency chain down to the Test row itself.
  async remove(id: string) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) throw new NotFoundException("Test not found");

    const attemptIds = (
      await this.prisma.testAttempt.findMany({ where: { testId: id }, select: { id: true } })
    ).map((a) => a.id);
    const questionIds = (
      await this.prisma.question.findMany({ where: { testId: id }, select: { id: true } })
    ).map((q) => q.id);

    await this.prisma.violation.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await this.prisma.codingSubmission.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await this.prisma.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await this.prisma.testAttempt.deleteMany({ where: { testId: id } });
    await this.prisma.codingTestCase.deleteMany({ where: { codingProblem: { questionId: { in: questionIds } } } });
    await this.prisma.codingProblem.deleteMany({ where: { questionId: { in: questionIds } } });
    await this.prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await this.prisma.question.deleteMany({ where: { testId: id } });
    await this.prisma.test.delete({ where: { id } });

    return { success: true };
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
          where: test.batchScope === "ALL" ? {} : { section: test.batchScope },
        });
      })(),
    ]);

    const students = inProgress.map((a) => ({
      attemptId: a.id,
      studentId: a.studentId,
      studentName: a.student.user.fullName,
      rollNo: a.student.rollNo,
      section: a.student.section,
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

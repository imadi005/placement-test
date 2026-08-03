import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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

  // Ranked by finalScore (falling back to the instantly-known mcqScore for
  // anything not yet graded) across every submitted attempt — coordinators
  // can always see it; a student can only see it once THEIR OWN attempt is
  // submitted, so nobody can peek at standings mid-test.
  async getLeaderboard(testId: string, requester: { id: string; role: string }) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException("Test not found");

    if (requester.role === "student") {
      const myAttempt = await this.prisma.testAttempt.findUnique({
        where: { testId_studentId: { testId, studentId: requester.id } },
      });
      if (!myAttempt || myAttempt.status === "in_progress") {
        throw new ForbiddenException("Submit your attempt to see the leaderboard.");
      }
    }

    // Explicit orderBy so a full tie (same score, same total coding time —
    // e.g. an all-MCQ test where two students both score 80%) resolves the
    // same way on every call. Without it, Postgres row order is
    // unspecified, so Array.sort's stability doesn't actually guarantee a
    // stable *result* — "who's the overall winner" could flip on refresh.
    const attempts = await this.prisma.testAttempt.findMany({
      where: { testId, status: { not: "in_progress" } },
      include: {
        student: { include: { user: { select: { fullName: true } } } },
        codingSubmissions: true,
      },
      orderBy: { id: "asc" },
    });

    // Tie-break signal for the overall ranking: total time across a
    // student's own scoring coding submissions. A student with no scoring
    // coding submissions sorts after everyone who has one, tie-score or
    // not — "no verified optimized code" can't outrank "some".
    const totalCodingTimeMs = (a: (typeof attempts)[number]) => {
      const scoring = a.codingSubmissions.filter((s) => Number(s.score) > 0 && s.execTimeMs !== null);
      if (!scoring.length) return Infinity;
      return scoring.reduce((sum, s) => sum + (s.execTimeMs as number), 0);
    };

    const ranked = attempts
      .map((a) => ({
        studentId: a.studentId,
        rollNo: a.student.rollNo,
        fullName: a.student.user.fullName,
        batch: a.student.batch,
        section: a.student.section,
        score: a.finalScore !== null ? Number(a.finalScore) : a.mcqScore !== null ? Number(a.mcqScore) : 0,
        totalCodingTimeMs: totalCodingTimeMs(a),
      }))
      .sort((a, b) => b.score - a.score || a.totalCodingTimeMs - b.totalCodingTimeMs)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    const myEntry = requester.role === "student" ? ranked.find((r) => r.studentId === requester.id) : null;

    // Per-problem "most optimized code" winners — independent of the
    // overall ranking above. Eligibility: any submission that scored
    // above 0 (partial credit counts, per the earlier product call);
    // ranked by score first (a correct-but-slower solution still beats a
    // partially-correct-but-fast one), then lowest time, then lowest
    // memory as the final tiebreak.
    const codingQuestions = await this.prisma.question.findMany({
      where: { testId, questionType: "coding" },
      orderBy: { questionOrder: "asc" },
    });

    const problemWinners = codingQuestions.map((q) => {
      const candidates = attempts
        .flatMap((a) => a.codingSubmissions.filter((s) => s.questionId === q.id && Number(s.score) > 0))
        .sort((x, y) => {
          if (Number(y.score) !== Number(x.score)) return Number(y.score) - Number(x.score);
          const xTime = x.execTimeMs ?? Infinity;
          const yTime = y.execTimeMs ?? Infinity;
          if (xTime !== yTime) return xTime - yTime;
          return (x.memoryKb ?? Infinity) - (y.memoryKb ?? Infinity);
        });

      const winnerSubmission = candidates[0];
      if (!winnerSubmission) {
        return { questionId: q.id, questionOrder: q.questionOrder, questionText: q.questionText, winner: null };
      }
      const attempt = attempts.find((a) => a.codingSubmissions.some((s) => s.id === winnerSubmission.id));
      return {
        questionId: q.id,
        questionOrder: q.questionOrder,
        questionText: q.questionText,
        winner: attempt
          ? {
              studentId: attempt.studentId,
              rollNo: attempt.student.rollNo,
              fullName: attempt.student.user.fullName,
              score: Number(winnerSubmission.score),
              maxScore: Number(winnerSubmission.maxScore),
              execTimeMs: winnerSubmission.execTimeMs,
              memoryKb: winnerSubmission.memoryKb,
            }
          : null,
      };
    });

    const publicEntries = ranked.map(({ totalCodingTimeMs, ...rest }) => rest);

    return {
      testTitle: test.title,
      entries: publicEntries,
      totalParticipants: publicEntries.length,
      myRank: myEntry?.rank ?? null,
      myScore: myEntry?.score ?? null,
      problemWinners,
      overallWinner: publicEntries[0] ?? null,
    };
  }
}

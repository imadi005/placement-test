import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { JudgeService } from "../judge/judge.service";
import { SubmitAnswerDto, ReportViolationDto, RunCodeDto } from "./dto/attempt.dto";
import { seededShuffle } from "./shuffle.util";

const MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT = 5;

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService, private redis: RedisService, private judge: JudgeService) {}

  // Design doc §5, step 1: creates the attempt row lazily as the student
  // joins. Relies on the (testId, studentId) unique constraint so a second
  // "start" call for the same student+test resumes rather than duplicates —
  // this is the single-active-attempt enforcement from §11.
  async start(testId: string, studentId: string) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException("Test not found");
    if (test.status !== "live") {
      throw new BadRequestException("This test is not currently live");
    }

    let attempt = await this.prisma.testAttempt.findUnique({
      where: { testId_studentId: { testId, studentId } },
    });

    if (attempt && attempt.status !== "in_progress") {
      throw new ForbiddenException("This attempt has already been submitted");
    }

    if (!attempt) {
      try {
        attempt = await this.prisma.testAttempt.create({
          data: { testId, studentId, startedAt: new Date(), status: "in_progress" },
        });
        await this.redis.setAttemptState(attempt.id, {
          testId,
          studentId,
          startedAt: attempt.startedAt,
          durationMinutes: test.durationMinutes,
        });
      } catch (err) {
        // Two "start" calls for the same student+test can legitimately race
        // — a double-click, a flaky-network retry, or (in dev) React Strict
        // Mode double-invoking effects. The unique constraint is the real
        // guard; losing this race should resume the winner's attempt, not
        // crash with an unhandled 500.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          attempt = await this.prisma.testAttempt.findUniqueOrThrow({
            where: { testId_studentId: { testId, studentId } },
          });
        } else {
          throw err;
        }
      }
    }

    await this.redis.addActiveStudent(testId, studentId);
    await this.redis.publishTestEvent(testId, {
      type: "student_joined",
      studentId,
      attemptId: attempt.id,
    });

    // Never return correct-answer flags to the student — strip them before
    // the questions leave the server. Same rule for coding questions: only
    // sample test cases (isSample) are ever sent down; hidden cases' input
    // and expected output never leave the DB until judged server-side.
    const questionsInAuthoredOrder = await this.prisma.question.findMany({
      where: { testId },
      orderBy: { questionOrder: "asc" },
      include: {
        options: { select: { id: true, optionText: true } },
        codingProblem: {
          include: {
            testCases: {
              where: { isSample: true },
              orderBy: { orderIndex: "asc" },
              select: { id: true, input: true, expectedOutput: true, orderIndex: true },
            },
          },
        },
      },
    });

    // Shuffle question order AND each question's option order — seeded by
    // this attempt's id, so no two students see the same arrangement, but a
    // given student's own refresh/resume always reproduces the same one
    // (nothing to persist, no risk of drifting between requests).
    const questions = seededShuffle(questionsInAuthoredOrder, `${attempt.id}:questions`).map((q, i) => ({
      ...q,
      questionOrder: i + 1,
      options: seededShuffle(q.options, `${attempt.id}:${q.id}`),
    }));

    // On a resumed attempt (page refresh, reconnect), the client otherwise
    // has no way to know what was already autosaved — it would render a
    // blank test even though the student's answers are safe in the DB.
    const existingAnswers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
      select: {
        questionId: true,
        selectedOptionId: true,
        freeTextAnswer: true,
        submittedCode: true,
        codeLanguage: true,
      },
    });

    // TestAttempt has no durationMinutes of its own (that's a Test-level
    // field) — the client's countdown needs it, so it rides along here
    // rather than the frontend silently falling back to a hardcoded default.
    return {
      attempt: { ...attempt, durationMinutes: test.durationMinutes },
      questions,
      existingAnswers,
      serverStartedAt: attempt.startedAt,
    };
  }

  private async assertOwnership(attemptId: string, studentId: string) {
    const attempt = await this.prisma.testAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (attempt.studentId !== studentId) {
      throw new ForbiddenException("This attempt does not belong to you");
    }
    if (attempt.status !== "in_progress") {
      throw new BadRequestException("This attempt is no longer in progress");
    }
    return attempt;
  }

  // Autosave — called frequently from the client. Upserts on the
  // (attemptId, questionId) unique constraint so repeated saves for the
  // same question just overwrite, never duplicate.
  async saveAnswer(attemptId: string, studentId: string, dto: SubmitAnswerDto) {
    await this.assertOwnership(attemptId, studentId);

    return this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: dto.questionId } },
      create: {
        attemptId,
        questionId: dto.questionId,
        selectedOptionId: dto.selectedOptionId,
        freeTextAnswer: dto.freeTextAnswer,
        submittedCode: dto.submittedCode,
        codeLanguage: dto.codeLanguage,
        answeredAt: new Date(),
      },
      update: {
        selectedOptionId: dto.selectedOptionId,
        freeTextAnswer: dto.freeTextAnswer,
        submittedCode: dto.submittedCode,
        codeLanguage: dto.codeLanguage,
        answeredAt: new Date(),
      },
    });
  }

  // The student's "Run" button — judges the current editor content against
  // SAMPLE cases only (never hidden ones, and never persisted as a graded
  // submission) so they get pass/fail + actual-output feedback while still
  // working on the problem. Does not affect score.
  async runCode(attemptId: string, studentId: string, questionId: string, dto: RunCodeDto) {
    await this.assertOwnership(attemptId, studentId);

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { codingProblem: { include: { testCases: { where: { isSample: true }, orderBy: { orderIndex: "asc" } } } } },
    });
    if (!question || question.questionType !== "coding" || !question.codingProblem) {
      throw new NotFoundException("Coding question not found");
    }
    if (!question.codingProblem.allowedLanguages.includes(dto.language)) {
      throw new BadRequestException(`This problem doesn't accept ${dto.language}`);
    }

    const results = await this.judge.runAgainstCases(
      dto.sourceCode,
      dto.language,
      question.codingProblem.timeLimitMs,
      question.codingProblem.memoryLimitMb,
      question.codingProblem.testCases.map((tc) => ({
        id: tc.id,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isSample: true,
        points: Number(tc.points),
      }))
    );

    return { results };
  }

  // Design doc §7: tab-switch/fullscreen violations are the reliable
  // signals. This persists every event (audit trail) and auto-submits once
  // the threshold is crossed — the "violation scoring" approach, not a
  // guarantee of catching everything.
  async reportViolation(attemptId: string, studentId: string, dto: ReportViolationDto) {
    const attempt = await this.assertOwnership(attemptId, studentId);

    await this.prisma.violation.create({
      data: { attemptId, type: dto.type as any, meta: dto.meta as any },
    });

    const count = await this.redis.incrementViolationCount(attemptId);

    await this.redis.publishTestEvent(attempt.testId, {
      type: "violation",
      attemptId,
      studentId,
      violationType: dto.type,
      count,
    });

    if (count >= MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT) {
      await this.submit(attemptId, studentId, "violation_threshold");
      return { autoSubmitted: true, violationCount: count };
    }

    return { autoSubmitted: false, violationCount: count };
  }

  // Judges one coding answer against EVERY test case (sample + hidden),
  // via Judge0 — unlike runCode() (samples only, ephemeral), this is the
  // one graded, persisted judgement for the question. Runs outside any DB
  // transaction since it's slow network I/O; only the resulting DB writes
  // belong in the transaction submit() builds afterward.
  private async gradeCodingAnswer(answer: {
    id: string;
    questionId: string;
    submittedCode: string | null;
    codeLanguage: string | null;
  }) {
    if (!answer.submittedCode || !answer.codeLanguage) {
      return { answerId: answer.id, questionId: answer.questionId, score: 0, submission: null };
    }

    const codingProblem = await this.prisma.codingProblem.findUnique({
      where: { questionId: answer.questionId },
      include: { testCases: { orderBy: { orderIndex: "asc" } } },
    });
    if (!codingProblem) {
      return { answerId: answer.id, questionId: answer.questionId, score: 0, submission: null };
    }

    const results = await this.judge.runAgainstCases(
      answer.submittedCode,
      answer.codeLanguage,
      codingProblem.timeLimitMs,
      codingProblem.memoryLimitMb,
      codingProblem.testCases.map((tc) => ({
        id: tc.id,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isSample: tc.isSample,
        points: Number(tc.points),
      }))
    );

    const maxScore = codingProblem.testCases.reduce((sum, tc) => sum + Number(tc.points), 0);
    const score = results.reduce((sum, r) => sum + r.points, 0);
    const overallStatus = results.every((r) => r.passed)
      ? "accepted"
      : results.some((r) => r.status === "judge_unavailable")
        ? "judge_unavailable"
        : results.some((r) => r.status === "compile_error")
          ? "compile_error"
          : "wrong_answer";

    return {
      answerId: answer.id,
      questionId: answer.questionId,
      score,
      submission: {
        language: answer.codeLanguage,
        sourceCode: answer.submittedCode,
        status: overallStatus,
        score,
        maxScore,
        results: results as unknown as Prisma.InputJsonValue,
      },
    };
  }

  // MCQ scoring is always instant; coding questions are judged here too
  // (against every test case, sample + hidden) so submit() is the one
  // place a whole attempt's score becomes final. Never trust the client's
  // elapsed-time claim — this only checks ownership + status, actual
  // deadline enforcement is the gateway's job (ticking against
  // `attempt:{id}:state`, not this endpoint).
  async submit(attemptId: string, studentId: string, reason: "manual" | "timeout" | "violation_threshold") {
    const attempt = await this.assertOwnership(attemptId, studentId);

    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      include: { question: true, selectedOption: true },
    });

    let mcqScore = 0;
    const mcqAwards: { id: string; marksAwarded: number }[] = [];

    for (const answer of answers) {
      if (answer.question.questionType === "coding") continue;
      const isCorrect = Boolean(answer.selectedOption?.isCorrect);
      const awarded = isCorrect ? Number(answer.question.marks) : 0;
      mcqScore += awarded;
      mcqAwards.push({ id: answer.id, marksAwarded: awarded });
    }

    // Sequential, not Promise.all — each one is a handful of Judge0 calls
    // already; running every coding question's judging concurrently would
    // just hammer the judge server harder for no benefit at this scale.
    const codingAnswers = answers.filter((a) => a.question.questionType === "coding");
    const codingGrades = [];
    for (const answer of codingAnswers) {
      codingGrades.push(await this.gradeCodingAnswer(answer));
    }
    const codingScore = codingGrades.reduce((sum, g) => sum + g.score, 0);
    const finalScore = mcqScore + codingScore;

    const status = reason === "violation_threshold" ? "flagged" : "graded";

    const [updated] = await this.prisma.$transaction([
      this.prisma.testAttempt.update({
        where: { id: attemptId },
        data: {
          status,
          submittedAt: new Date(),
          mcqScore,
          finalScore,
        },
      }),
      // Per-question marksAwarded so the results screen's breakdown agrees
      // with the aggregate mcqScore above — previously only the aggregate
      // was ever written, so every MCQ line item showed "0" regardless of
      // whether it was actually correct.
      ...mcqAwards.map((a) =>
        this.prisma.attemptAnswer.update({
          where: { id: a.id },
          data: { marksAwarded: a.marksAwarded },
        })
      ),
      ...codingGrades
        .filter((g) => g.submission)
        .map((g) =>
          this.prisma.attemptAnswer.update({
            where: { id: g.answerId },
            data: { marksAwarded: g.score },
          })
        ),
      ...codingGrades
        .filter((g): g is typeof g & { submission: NonNullable<(typeof g)["submission"]> } => Boolean(g.submission))
        .map((g) =>
          this.prisma.codingSubmission.upsert({
            where: { attemptId_questionId: { attemptId, questionId: g.questionId } },
            create: { attemptId, questionId: g.questionId, ...g.submission },
            update: { ...g.submission, judgedAt: new Date() },
          })
        ),
    ]);

    await this.redis.removeActiveStudent(attempt.testId, studentId);
    await this.redis.publishTestEvent(attempt.testId, {
      type: "attempt_submitted",
      attemptId,
      studentId,
      reason,
    });

    return updated;
  }

  // Includes each question's options (with isCorrect) and the student's
  // selected option — safe to reveal here since the attempt is already
  // submitted, unlike the strip-correct-answers rule on start().
  async getResult(attemptId: string, studentId: string) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: {
          include: {
            question: { include: { options: true } },
            selectedOption: true,
          },
          orderBy: { question: { questionOrder: "asc" } },
        },
      },
    });
    if (!attempt) throw new NotFoundException("Attempt not found");
    if (attempt.studentId !== studentId) throw new ForbiddenException("Not your attempt");
    return attempt;
  }

  // Student's own dashboard — score history across every test they've taken.
  async listForStudent(studentId: string) {
    return this.prisma.testAttempt.findMany({
      where: { studentId },
      include: { test: { select: { title: true } } },
      orderBy: { submittedAt: "desc" },
    });
  }
}

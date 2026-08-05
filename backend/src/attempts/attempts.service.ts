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
import { FunctionSignature } from "../judge/harness/harness-types";
import { SubmitAnswerDto, ReportViolationDto, RunCodeDto } from "./dto/attempt.dto";
import { seededShuffle } from "./shuffle.util";

// codingProblem's functionName/parameters/returnType columns describe the
// LeetCode-style signature the student implements — this is the one place
// that shape gets read off the Prisma row and handed to the judge.
function toFunctionSignature(codingProblem: {
  functionName: string;
  parameters: Prisma.JsonValue;
  returnType: string;
}): FunctionSignature {
  return {
    functionName: codingProblem.functionName,
    parameters: codingProblem.parameters as unknown as FunctionSignature["parameters"],
    returnType: codingProblem.returnType as FunctionSignature["returnType"],
  };
}

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
        markedForReview: true,
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

    // An option id is only ever meaningful for the question it actually
    // belongs to — without this check, any option id a student can learn
    // (e.g. from a previous test's results, which do reveal isCorrect) could
    // be replayed as the answer to an unrelated question in a different
    // test to claim its marks, since QuestionOption.id is a global UUID
    // with no scoping enforced at grading time otherwise.
    if (dto.selectedOptionId) {
      const option = await this.prisma.questionOption.findUnique({
        where: { id: dto.selectedOptionId },
        select: { questionId: true },
      });
      if (!option || option.questionId !== dto.questionId) {
        throw new BadRequestException("That option doesn't belong to this question.");
      }
    }

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
        markedForReview: dto.markedForReview ?? false,
      },
      update: {
        selectedOptionId: dto.selectedOptionId,
        freeTextAnswer: dto.freeTextAnswer,
        submittedCode: dto.submittedCode,
        codeLanguage: dto.codeLanguage,
        answeredAt: new Date(),
        // Only touch the flag when the caller actually sent one — a plain
        // content autosave (typing code, picking an option) must not
        // silently clear a mark the student set earlier from a different
        // request.
        ...(dto.markedForReview !== undefined ? { markedForReview: dto.markedForReview } : {}),
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
      })),
      toFunctionSignature(question.codingProblem)
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

    // Postgres, not Redis — the Redis counter used to expire after 30 min of
    // no new violations for the same attempt (attemptViolationsKey's TTL),
    // silently restarting from 1 on the next one instead of continuing the
    // real total. That meant a student who spaced violations more than 30
    // min apart could rack up well past MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT
    // in the persisted audit trail (correctly visible in analytics) while
    // never actually crossing the threshold that's supposed to auto-submit
    // them. Every Violation row is already being persisted right above —
    // counting those directly is both simpler and has no expiry to trip
    // over.
    const count = await this.prisma.violation.count({ where: { attemptId } });

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
      include: { testCases: { orderBy: { orderIndex: "asc" } }, question: { select: { marks: true } } },
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
      })),
      toFunctionSignature(codingProblem)
    );

    // Each test case's `points` is just a relative weight among that
    // problem's own cases (defaults to 1 for every case, sample or
    // hidden) — it was being used directly as the awarded/max score,
    // so a 1-mark question with 3 test cases showed "3/3" instead of
    // "1/1", and that inflated raw number fed straight into finalScore,
    // pushing a test's total score past its own declared max. Scale the
    // raw test-case result against the question's actual `marks` so a
    // coding question's contribution to the score is worth exactly what
    // its own marks say, same as an MCQ.
    const rawMaxScore = codingProblem.testCases.reduce((sum, tc) => sum + Number(tc.points), 0);
    const rawScore = results.reduce((sum, r) => sum + r.points, 0);
    const questionMarks = Number(codingProblem.question.marks);
    const maxScore = questionMarks;
    const score = rawMaxScore > 0 ? (rawScore / rawMaxScore) * questionMarks : 0;
    const overallStatus = results.every((r) => r.passed)
      ? "accepted"
      : results.some((r) => r.status === "judge_unavailable")
        ? "judge_unavailable"
        : results.some((r) => r.status === "compile_error")
          ? "compile_error"
          : "wrong_answer";

    // Worst-case time/memory across this submission's cases — the
    // "most optimized code" ranking (per-problem winner) is decided on
    // this, so it has to reflect the slowest/heaviest case actually run,
    // not an average that could hide a near-timeout on one input.
    const times = results.map((r) => r.timeMs).filter((t): t is number => t !== null);
    const memories = results.map((r) => r.memoryKb).filter((m): m is number => m !== null);
    const execTimeMs = times.length ? Math.max(...times) : null;
    const memoryKb = memories.length ? Math.max(...memories) : null;

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
        execTimeMs,
        memoryKb,
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
    const status = reason === "violation_threshold" ? "flagged" : "graded";

    // Atomic claim — a single Alt+Tab genuinely fires both `visibilitychange`
    // (tab_switch) and `fullscreenchange` (fullscreen_exit) in the same
    // instant, so two concurrent violation reports both crossing the
    // auto-submit threshold at once isn't a contrived race, it's a normal
    // real-world action. assertOwnership()'s check above is a plain read —
    // multiple concurrent calls can all see status="in_progress" and pass
    // it before any of them commits. This updateMany's WHERE clause is the
    // actual race-safe part: only the request whose UPDATE actually matches
    // a still-"in_progress" row (Postgres serializes this per-row) flips
    // it; everyone else affects 0 rows and returns the winner's result
    // instead of redoing the full grading pass (which, for a coding-round
    // test, would otherwise hit Judge0 with duplicate submissions per
    // question — wasteful, not just slow).
    const claim = await this.prisma.testAttempt.updateMany({
      where: { id: attemptId, status: "in_progress" },
      data: { status },
    });
    if (claim.count === 0) {
      return this.prisma.testAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    }

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

    // Concurrent, not sequential — a load test (100 students x 50 coding
    // questions) showed sequential-per-question judging taking 5+ minutes
    // per submit, purely from stacking our own network round-trips on top
    // of each other. Judge0 already queues submissions past its own worker
    // capacity, so it bears the real concurrency limit either way; this
    // just stops paying for N round-trips in series when we don't have to.
    const codingAnswers = answers.filter((a) => a.question.questionType === "coding");
    const codingGrades = await Promise.all(codingAnswers.map((answer) => this.gradeCodingAnswer(answer)));
    const codingScore = codingGrades.reduce((sum, g) => sum + g.score, 0);
    const finalScore = mcqScore + codingScore;

    const [updated] = await this.prisma.$transaction([
      this.prisma.testAttempt.update({
        where: { id: attemptId },
        data: {
          // status already flipped by the atomic claim above.
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

    // Summed from the test's full question set, not `answers` — a question
    // the student never touched has no AttemptAnswer row at all, so summing
    // marks from `answers` alone would under-count the true "out of" total.
    const questions = await this.prisma.question.findMany({
      where: { testId: attempt.testId },
      select: { marks: true },
    });
    const maxScore = questions.reduce((sum, q) => sum + Number(q.marks), 0);

    return { ...attempt, maxScore };
  }

  // Student's own dashboard — score history across every test they've taken.
  async listForStudent(studentId: string) {
    const attempts = await this.prisma.testAttempt.findMany({
      where: { studentId },
      include: { test: { select: { title: true, questions: { select: { marks: true } } } } },
      orderBy: { submittedAt: "desc" },
    });

    return attempts.map(({ test, ...attempt }) => ({
      ...attempt,
      test: { title: test.title },
      maxScore: test.questions.reduce((sum, q) => sum + Number(q.marks), 0),
    }));
  }
}

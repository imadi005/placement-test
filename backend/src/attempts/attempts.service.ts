import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { SubmitAnswerDto, ReportViolationDto } from "./dto/attempt.dto";

const MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT = 5;

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

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
    // the questions leave the server.
    const questions = await this.prisma.question.findMany({
      where: { testId },
      orderBy: { questionOrder: "asc" },
      include: { options: { select: { id: true, optionText: true } } },
    });

    return { attempt, questions, serverStartedAt: attempt.startedAt };
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
        answeredAt: new Date(),
      },
      update: {
        selectedOptionId: dto.selectedOptionId,
        freeTextAnswer: dto.freeTextAnswer,
        answeredAt: new Date(),
      },
    });
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

  // Design doc §10a: MCQ scores instantly; if the test has any non-MCQ
  // questions the attempt goes to pending_grading instead of graded. Never
  // trust the client's elapsed-time claim — this only checks ownership +
  // status, actual deadline enforcement is the gateway's job (ticking
  // against `attempt:{id}:state`, not this endpoint).
  async submit(attemptId: string, studentId: string, reason: "manual" | "timeout" | "violation_threshold") {
    const attempt = await this.assertOwnership(attemptId, studentId);

    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      include: { question: true, selectedOption: true },
    });

    let mcqScore = 0;
    let hasNonMcq = false;

    for (const answer of answers) {
      if (answer.question.questionType === "mcq") {
        if (answer.selectedOption?.isCorrect) {
          mcqScore += Number(answer.question.marks);
        }
      } else {
        hasNonMcq = true;
      }
    }

    const status = reason === "violation_threshold" ? "flagged" : hasNonMcq ? "pending_grading" : "graded";

    const updated = await this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        status,
        submittedAt: new Date(),
        mcqScore,
        finalScore: hasNonMcq ? null : mcqScore,
      },
    });

    await this.redis.removeActiveStudent(attempt.testId, studentId);
    await this.redis.publishTestEvent(attempt.testId, {
      type: "attempt_submitted",
      attemptId,
      studentId,
      reason,
    });

    return updated;
  }

  async getResult(attemptId: string, studentId: string) {
    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: { include: { question: true } },
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

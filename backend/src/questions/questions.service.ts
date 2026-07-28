import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { DocxParserService } from "./parsing/docx-parser.service";
import { PdfParserService } from "./parsing/pdf-parser.service";
import { QuestionExtractionService } from "./parsing/question-extraction.service";
import { CommitQuestionsDto } from "./dto/commit-questions.dto";
import { UpsertQuestionDto } from "./dto/upsert-question.dto";
import { DraftQuestion } from "./parsing/draft-question.types";

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

@Injectable()
export class QuestionsService {
  constructor(
    private prisma: PrismaService,
    private docxParser: DocxParserService,
    private pdfParser: PdfParserService,
    private extractor: QuestionExtractionService
  ) {}

  // Step 1-2 of the ingestion pipeline (design doc §10): parse the uploaded
  // file into draft questions. NOTHING is written to the DB here — this is
  // preview-only, returned straight to the coordinator's review screen.
  async parsePreview(file: Express.Multer.File): Promise<DraftQuestion[]> {
    if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Only .docx and .pdf files are supported");
    }

    const rawText =
      file.mimetype === "application/pdf"
        ? await this.pdfParser.extractText(file.buffer)
        : await this.docxParser.extractText(file.buffer);

    if (!rawText || rawText.trim().length === 0) {
      throw new BadRequestException(
        "No extractable text found in this file — is it a scanned image PDF?"
      );
    }

    return this.extractor.extract(rawText);
  }

  // Step 3-4: coordinator has reviewed/edited the draft in the UI and
  // submits the final set — THIS persists it. Replaces any existing
  // questions on the test (a re-upload/re-review fully replaces the set,
  // it does not append to a partial previous commit).
  //
  // Uses bulk createMany (with client-generated ids) instead of one
  // create() call per question — a sequential loop of N round-trips over a
  // networked connection (e.g. Neon's pooler) reliably blew past Prisma's
  // default 5s interactive-transaction timeout on anything more than a
  // couple of questions. Two bulk statements instead of N+1 sequential ones
  // fixes that; the explicit timeout below is just a safety margin on top.
  async commit(testId: string, dto: CommitQuestionsDto) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException("Test not found");
    if (test.status !== "draft") {
      throw new BadRequestException("Questions can only be committed while the test is in draft");
    }

    const questionIds = dto.questions.map(() => randomUUID());
    const questionRows = dto.questions.map((q, i) => ({
      id: questionIds[i],
      testId,
      questionText: q.questionText,
      questionOrder: q.questionOrder,
      questionType: q.questionType as any,
      modelAnswer: q.modelAnswer,
      rubricNotes: q.rubricNotes,
    }));
    const optionRows = dto.questions.flatMap((q, i) =>
      q.options.map((o) => ({
        questionId: questionIds[i],
        optionText: o.optionText,
        isCorrect: o.isCorrect,
      }))
    );

    await this.prisma.$transaction(
      async (tx) => {
        await tx.question.deleteMany({ where: { testId } });
        if (questionRows.length > 0) await tx.question.createMany({ data: questionRows });
        if (optionRows.length > 0) await tx.questionOption.createMany({ data: optionRows });

        if (dto.sourceFileUrl) {
          await tx.test.update({ where: { id: testId }, data: { sourceFileUrl: dto.sourceFileUrl } });
        }

        // Committing resets approval — a re-committed set must be reviewed
        // again before the test can be scheduled (see TestsService.schedule).
        await tx.test.update({ where: { id: testId }, data: { approved: false } });
      },
      { timeout: 15000 }
    );

    return this.prisma.question.findMany({
      where: { testId },
      include: { options: true },
      orderBy: { questionOrder: "asc" },
    });
  }

  async list(testId: string) {
    return this.prisma.question.findMany({
      where: { testId },
      include: { options: true },
      orderBy: { questionOrder: "asc" },
    });
  }

  async addOne(testId: string, dto: UpsertQuestionDto) {
    return this.prisma.question.create({
      data: {
        testId,
        questionText: dto.questionText,
        questionOrder: dto.questionOrder,
        questionType: dto.questionType as any,
        modelAnswer: dto.modelAnswer,
        rubricNotes: dto.rubricNotes,
        options: { create: dto.options.map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })) },
      },
      include: { options: true },
    });
  }

  async updateOne(questionId: string, dto: UpsertQuestionDto) {
    const existing = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!existing) throw new NotFoundException("Question not found");

    return this.prisma.$transaction(
      async (tx) => {
        await tx.questionOption.deleteMany({ where: { questionId } });
        return tx.question.update({
          where: { id: questionId },
          data: {
            questionText: dto.questionText,
            questionOrder: dto.questionOrder,
            questionType: dto.questionType as any,
            modelAnswer: dto.modelAnswer,
            rubricNotes: dto.rubricNotes,
            options: { create: dto.options.map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })) },
          },
          include: { options: true },
        });
      },
      { timeout: 15000 }
    );
  }

  async deleteOne(questionId: string) {
    await this.prisma.questionOption.deleteMany({ where: { questionId } });
    await this.prisma.question.delete({ where: { id: questionId } });
    return { success: true };
  }
}

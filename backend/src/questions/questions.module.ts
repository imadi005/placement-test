import { Module } from "@nestjs/common";
import { QuestionsController } from "./questions.controller";
import { QuestionsService } from "./questions.service";
import { DocxParserService } from "./parsing/docx-parser.service";
import { PdfParserService } from "./parsing/pdf-parser.service";
import { QuestionExtractionService } from "./parsing/question-extraction.service";

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, DocxParserService, PdfParserService, QuestionExtractionService],
})
export class QuestionsModule {}

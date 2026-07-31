import { Module } from "@nestjs/common";
import { QuestionsController } from "./questions.controller";
import { QuestionsService } from "./questions.service";
import { DocxParserService } from "./parsing/docx-parser.service";
import { PdfParserService } from "./parsing/pdf-parser.service";
import { TextParserService } from "./parsing/text-parser.service";
import { QuestionExtractionService } from "./parsing/question-extraction.service";

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, DocxParserService, PdfParserService, TextParserService, QuestionExtractionService],
})
export class QuestionsModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { QuestionsService } from "./questions.service";
import { CommitQuestionsDto } from "./dto/commit-questions.dto";
import { UpsertQuestionDto } from "./dto/upsert-question.dto";

// RBAC matrix (design doc §8): "Add/edit question bank + answers" —
// coordinator only, admin is explicitly view-only here.
@Controller("tests/:testId/questions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("coordinator")
export class QuestionsController {
  constructor(private questionsService: QuestionsService) {}

  // Step 1 of ingestion: upload docx/pdf, get back a parsed draft — nothing
  // saved yet. 10MB cap is generous for a text-only question-set document.
  @Post("parse-preview")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } })
  )
  parsePreview(@UploadedFile() file: Express.Multer.File) {
    return this.questionsService.parsePreview(file);
  }

  // Step 2: coordinator has reviewed/edited the draft in the UI, commits
  // the final set — this is what actually persists to the DB.
  @Post("commit")
  commit(@Param("testId") testId: string, @Body() dto: CommitQuestionsDto) {
    return this.questionsService.commit(testId, dto);
  }

  @Get()
  list(@Param("testId") testId: string) {
    return this.questionsService.list(testId);
  }

  @Post()
  addOne(@Param("testId") testId: string, @Body() dto: UpsertQuestionDto) {
    return this.questionsService.addOne(testId, dto);
  }

  @Put(":questionId")
  updateOne(@Param("questionId") questionId: string, @Body() dto: UpsertQuestionDto) {
    return this.questionsService.updateOne(questionId, dto);
  }

  @Delete(":questionId")
  deleteOne(@Param("questionId") questionId: string) {
    return this.questionsService.deleteOne(questionId);
  }
}

import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AttemptsService } from "./attempts.service";
import { ReportViolationDto, RunCodeDto, SubmitAnswerDto } from "./dto/attempt.dto";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("student")
export class AttemptsController {
  constructor(private attemptsService: AttemptsService) {}

  @Post("tests/:testId/attempts/start")
  start(@Param("testId") testId: string, @CurrentUser() user: { id: string }) {
    return this.attemptsService.start(testId, user.id);
  }

  @Post("attempts/:attemptId/answers")
  saveAnswer(
    @Param("attemptId") attemptId: string,
    @Body() dto: SubmitAnswerDto,
    @CurrentUser() user: { id: string }
  ) {
    return this.attemptsService.saveAnswer(attemptId, user.id, dto);
  }

  @Post("attempts/:attemptId/questions/:questionId/run")
  runCode(
    @Param("attemptId") attemptId: string,
    @Param("questionId") questionId: string,
    @Body() dto: RunCodeDto,
    @CurrentUser() user: { id: string }
  ) {
    return this.attemptsService.runCode(attemptId, user.id, questionId, dto);
  }

  @Post("attempts/:attemptId/violations")
  reportViolation(
    @Param("attemptId") attemptId: string,
    @Body() dto: ReportViolationDto,
    @CurrentUser() user: { id: string }
  ) {
    return this.attemptsService.reportViolation(attemptId, user.id, dto);
  }

  @Post("attempts/:attemptId/submit")
  submit(@Param("attemptId") attemptId: string, @CurrentUser() user: { id: string }) {
    return this.attemptsService.submit(attemptId, user.id, "manual");
  }

  @Get("attempts/:attemptId/result")
  getResult(@Param("attemptId") attemptId: string, @CurrentUser() user: { id: string }) {
    return this.attemptsService.getResult(attemptId, user.id);
  }

  @Get("students/me/attempts")
  listMine(@CurrentUser() user: { id: string }) {
    return this.attemptsService.listForStudent(user.id);
  }
}

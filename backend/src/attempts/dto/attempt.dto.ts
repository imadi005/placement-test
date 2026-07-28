import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";

export class SubmitAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsUUID()
  selectedOptionId?: string; // for MCQ

  @IsOptional()
  @IsString()
  freeTextAnswer?: string; // for short_answer/numeric/descriptive
}

export class ReportViolationDto {
  @IsIn(["tab_switch", "fullscreen_exit", "devtools_suspected", "copy_paste", "window_blur"])
  type!: string;

  @IsOptional()
  meta?: Record<string, unknown>;
}

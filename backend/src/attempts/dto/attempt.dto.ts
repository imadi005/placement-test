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

  @IsOptional()
  @IsString()
  submittedCode?: string; // for coding questions — the editor's current source

  @IsOptional()
  @IsIn(["c", "cpp", "java", "python"])
  codeLanguage?: string; // for coding questions — which language submittedCode is in
}

export class RunCodeDto {
  @IsString()
  sourceCode!: string;

  @IsIn(["c", "cpp", "java", "python"])
  language!: string;
}

export class ReportViolationDto {
  @IsIn(["tab_switch", "fullscreen_exit", "devtools_suspected", "copy_paste", "window_blur"])
  type!: string;

  @IsOptional()
  meta?: Record<string, unknown>;
}

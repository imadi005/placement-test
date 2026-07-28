import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, ValidateNested } from "class-validator";
import { ReviewedOptionDto } from "./commit-questions.dto";

export class UpsertQuestionDto {
  @IsString()
  questionText!: string;

  @IsInt()
  questionOrder!: number;

  @IsIn(["mcq", "short_answer", "numeric", "descriptive"])
  questionType!: string;

  @IsOptional()
  @IsString()
  modelAnswer?: string;

  @IsOptional()
  @IsString()
  rubricNotes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewedOptionDto)
  options!: ReviewedOptionDto[];
}

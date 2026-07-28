import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class ReviewedOptionDto {
  @IsString()
  optionText!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class ReviewedQuestionDto {
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

// The payload the coordinator's review screen submits after editing the
// parsed draft — this is what actually gets persisted. The parse-preview
// endpoint's raw output never touches the DB directly.
export class CommitQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReviewedQuestionDto)
  questions!: ReviewedQuestionDto[];

  @IsOptional()
  @IsString()
  sourceFileUrl?: string;
}

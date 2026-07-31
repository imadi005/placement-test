import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class ReviewedOptionDto {
  @IsString()
  optionText!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CodingTestCaseDto {
  @IsString()
  input!: string;

  @IsString()
  expectedOutput!: string;

  @IsBoolean()
  isSample!: boolean;

  @IsNumber()
  @Min(0)
  points!: number;
}

// Everything specific to a "coding" question — the problem statement itself
// stays on ReviewedQuestionDto.questionText, same as every other type.
export class CodingProblemDto {
  @IsOptional()
  @IsString()
  constraints?: string;

  @IsInt()
  @Min(100)
  timeLimitMs!: number;

  @IsInt()
  @Min(16)
  memoryLimitMb!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(["c", "cpp", "java", "python"], { each: true })
  allowedLanguages!: string[];

  // { [languageId]: starterSourceCode }
  @IsOptional()
  @IsObject()
  starterCode?: Record<string, string>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CodingTestCaseDto)
  testCases!: CodingTestCaseDto[];
}

export class ReviewedQuestionDto {
  @IsString()
  questionText!: string;

  @IsInt()
  questionOrder!: number;

  @IsIn(["mcq", "coding"])
  questionType!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewedOptionDto)
  options!: ReviewedOptionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CodingProblemDto)
  codingProblem?: CodingProblemDto;
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

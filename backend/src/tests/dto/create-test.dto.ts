import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { TEST_SCOPES } from "../../common/sections";

export class CreateTestDto {
  @IsString()
  title!: string;

  @IsIn(TEST_SCOPES)
  batchScope!: string;

  @IsInt()
  @Min(5)
  durationMinutes!: number;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;
}

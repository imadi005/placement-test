import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateTestDto {
  @IsString()
  title!: string;

  @IsIn(["A", "B", "C", "ALL"])
  batchScope!: string;

  @IsInt()
  @Min(5)
  durationMinutes!: number;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;
}

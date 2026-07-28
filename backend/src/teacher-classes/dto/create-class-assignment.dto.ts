import { IsInt, IsString, IsUUID, Max, Min } from "class-validator";

export class CreateClassAssignmentDto {
  @IsUUID()
  teacherId!: string;

  @IsString()
  section!: string;

  @IsString()
  subject!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number; // 0 = Sunday .. 6 = Saturday

  @IsString()
  startTime!: string; // "HH:MM"

  @IsString()
  endTime!: string;
}

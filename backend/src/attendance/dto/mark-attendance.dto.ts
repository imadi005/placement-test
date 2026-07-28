import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsUUID, ValidateNested } from "class-validator";

export class StudentAttendanceRecordDto {
  @IsUUID()
  studentId!: string;

  @IsIn(["present", "absent", "excused"])
  status!: string;
}

export class MarkAttendanceDto {
  @IsDateString()
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StudentAttendanceRecordDto)
  records!: StudentAttendanceRecordDto[];
}

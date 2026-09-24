import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsIn, ValidateNested } from "class-validator";
import { SECTIONS } from "../../common/sections";

export class SectionScheduleItemDto {
  @IsIn(SECTIONS)
  section!: string;

  @IsDateString()
  scheduledStart!: string;
}

export class SetSectionSchedulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SectionScheduleItemDto)
  schedules!: SectionScheduleItemDto[];
}

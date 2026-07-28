import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { Batch } from "@prisma/client";

export class ChangeBatchDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(Batch)
  newBatch!: Batch;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsUUID()
  relatedTestId?: string;
}

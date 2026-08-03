import { Module } from "@nestjs/common";
import { JudgeService } from "./judge.service";
import { HarnessBuilderService } from "./harness/harness-builder.service";

@Module({
  providers: [JudgeService, HarnessBuilderService],
  exports: [JudgeService],
})
export class JudgeModule {}

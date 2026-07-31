import { Module } from "@nestjs/common";
import { AttemptsController } from "./attempts.controller";
import { AttemptsService } from "./attempts.service";
import { JudgeModule } from "../judge/judge.module";

@Module({
  imports: [JudgeModule],
  controllers: [AttemptsController],
  providers: [AttemptsService],
  exports: [AttemptsService],
})
export class AttemptsModule {}

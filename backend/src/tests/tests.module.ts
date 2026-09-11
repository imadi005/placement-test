import { Module } from "@nestjs/common";
import { TestsController } from "./tests.controller";
import { TestsService } from "./tests.service";
import { TestSchedulerService } from "./test-scheduler.service";
import { AttemptsModule } from "../attempts/attempts.module";

@Module({
  imports: [AttemptsModule],
  controllers: [TestsController],
  providers: [TestsService, TestSchedulerService],
  exports: [TestsService],
})
export class TestsModule {}

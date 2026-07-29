import { Module } from "@nestjs/common";
import { TestsController } from "./tests.controller";
import { TestsService } from "./tests.service";
import { TestSchedulerService } from "./test-scheduler.service";

@Module({
  controllers: [TestsController],
  providers: [TestsService, TestSchedulerService],
  exports: [TestsService],
})
export class TestsModule {}

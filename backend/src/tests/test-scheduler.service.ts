import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const CHECK_INTERVAL_MS = 15_000;

// Polling rather than a proper job queue — deliberately simple for the
// scale this app targets. Checks every 15s for any test still `scheduled`
// whose `scheduledStart` has passed, and flips it to `live`. Coordinators
// can still start a test early manually (design doc's start() has no
// precondition) — this only fills the gap when nobody clicks anything.
@Injectable()
export class TestSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TestSchedulerService.name);
  private interval?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.interval = setInterval(() => this.checkDueTests(), CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private async checkDueTests() {
    try {
      const result = await this.prisma.test.updateMany({
        where: { status: "scheduled", scheduledStart: { lte: new Date() } },
        data: { status: "live" },
      });
      if (result.count > 0) {
        this.logger.log(`Auto-started ${result.count} scheduled test(s) whose start time arrived`);
      }
    } catch (err) {
      this.logger.error("Auto-start check failed", err as Error);
    }
  }
}

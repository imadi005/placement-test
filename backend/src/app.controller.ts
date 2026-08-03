import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";

@Controller()
export class AppController {
  constructor(private prisma: PrismaService) {}

  // Pinged every 10 min by .github/workflows/keep-alive.yml — no auth guard
  // (a cron job has no user session), and it touches the DB so Neon's
  // connection stays warm too, not just the Render dyno.
  @Get("health")
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { MailModule } from "./mail/mail.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { BatchesModule } from "./batches/batches.module";
import { TestsModule } from "./tests/tests.module";
import { QuestionsModule } from "./questions/questions.module";
import { AttemptsModule } from "./attempts/attempts.module";
import { GatewayModule } from "./gateway/gateway.module";
import { AnalyticsModule } from "./analytics/analytics.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Overridable via env for load testing — a single test client hits this
    // per-IP cap almost instantly regardless of real backend capacity,
    // which would measure the throttle, not the server. Defaults to 100/min
    // as before when GLOBAL_THROTTLE_LIMIT isn't set.
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: Number(process.env.GLOBAL_THROTTLE_LIMIT ?? 100) },
    ]),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    UsersModule,
    BatchesModule,
    TestsModule,
    QuestionsModule,
    AttemptsModule,
    GatewayModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import * as cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render (and every PaaS reverse proxy) terminates the connection before
  // it reaches this process, so without this Express's req.ip is always the
  // proxy's own internal address — every request looks like it's from the
  // same "IP", making ThrottlerGuard's per-IP limits (5/min on login) apply
  // globally across all real users instead of per-user. Trusting the first
  // proxy hop restores req.ip from X-Forwarded-For.
  app.set("trust proxy", 1);

  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields — never trust extra body properties
      transform: true,
    })
  );

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();

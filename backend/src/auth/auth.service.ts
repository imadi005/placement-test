import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService
  ) {}

  // Students log in with roll number, staff/admin with email — both routes
  // through here so there's exactly one place password verification happens.
  async validateCredentials(identifier: string, password: string) {
    const student = await this.prisma.student.findUnique({
      where: { rollNo: identifier },
      include: { user: true },
    });

    const user = student
      ? student.user
      : await this.prisma.user.findUnique({ where: { email: identifier } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return user;
  }

  async issueTokens(userId: string, role: string) {
    const payload = { sub: userId, role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: "15m",
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: "7d",
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; role: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Refresh token invalid or expired");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is inactive or no longer exists");
    }

    return this.issueTokens(user.id, user.role);
  }

  async hashPassword(plain: string) {
    return bcrypt.hash(plain, 12);
  }

  // NOTE: single-active-session-per-test enforcement (design doc §11) lives
  // in the Attempts module, not here — this only governs general login
  // sessions. When wiring test start, check Redis for an existing
  // `attempt:{testId}:{studentId}` session before allowing a second one.
}

import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService
  ) {}

  // Students identify with roll number, staff/admin with email — shared by
  // login and forgot-password so there's exactly one place this resolution
  // happens.
  private async resolveUser(identifier: string) {
    const student = await this.prisma.student.findUnique({
      where: { rollNo: identifier },
      include: { user: true },
    });

    return student ? student.user : this.prisma.user.findUnique({ where: { email: identifier } });
  }

  async validateCredentials(identifier: string, password: string) {
    const user = await this.resolveUser(identifier);

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

  // Called from the forced first-login screen — the user is already
  // JWT-authenticated at this point, so no current-password check is
  // needed, just clear the flag once a real password is set.
  async changePassword(userId: string, newPassword: string) {
    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  // Deliberately does not reveal whether the identifier matched an account
  // — same response either way, so this can't be used to enumerate valid
  // roll numbers/emails.
  async requestPasswordReset(identifier: string) {
    const user = await this.resolveUser(identifier);
    if (!user || !user.isActive) return;

    const token = randomBytes(32).toString("hex");
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    await this.mail.sendPasswordResetEmail(user.email, `${frontendUrl}/reset-password?token=${token}`);
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException("This reset link is invalid or has expired");
    }

    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, resetToken: null, resetTokenExpiresAt: null },
    });
  }

  // NOTE: single-active-session-per-test enforcement (design doc §11) lives
  // in the Attempts module, not here — this only governs general login
  // sessions. When wiring test start, check Redis for an existing
  // `attempt:{testId}:{studentId}` session before allowing a second one.
}

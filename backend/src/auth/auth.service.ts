import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { randomBytes, randomInt } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Shows just enough of the address to confirm "yes, that's my inbox" without
// giving a shoulder-surfer the whole thing — e.g. "25mcab58@kristujayanti.com"
// becomes "25******58@kristujayanti.com".
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 4) return `${local[0] ?? ""}***@${domain ?? ""}`;
  return `${local.slice(0, 2)}${"*".repeat(local.length - 4)}${local.slice(-2)}@${domain}`;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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

  // First login (mustChangePassword still true) never gets a session token
  // straight away — it gets an OTP mailed to the account's own registered
  // address instead, and only reaches the password-set step once that's
  // proven. Returns a masked version of the address for the frontend to
  // show ("code sent to 25******58@kristujayanti.com").
  async sendFirstLoginOtp(user: { id: string; email: string }): Promise<string> {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const otpCodeHash = await bcrypt.hash(otp, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCodeHash, otpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    // Deliberately not awaited: SMTP can be slow or, on some hosts, outright
    // unreachable (blocked outbound port) — the OTP is already saved, so
    // the login response (and the masked-email confirmation) shouldn't
    // hang on mail delivery. A failure here just means the email never
    // arrives; the user can log in again to get a fresh OTP.
    this.mail.sendOtpEmail(user.email, otp).catch((err) => {
      this.logger.error(`Failed to send first-login OTP to ${user.email}: ${(err as Error).message}`);
    });
    return maskEmail(user.email);
  }

  // Proves the OTP, then hands back the same kind of one-time token the
  // email reset-link flow uses — resetPassword() below is the single place
  // a new password actually gets written, regardless of which flow (OTP or
  // emailed link) got the user there.
  async verifyFirstLoginOtp(identifier: string, otp: string): Promise<string> {
    const user = await this.resolveUser(identifier);
    if (!user || !user.otpCodeHash || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new BadRequestException("That code is invalid or has expired.");
    }

    const matches = await bcrypt.compare(otp, user.otpCodeHash);
    if (!matches) {
      throw new BadRequestException("That code is invalid or has expired.");
    }

    const token = randomBytes(32).toString("hex");
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCodeHash: null,
        otpExpiresAt: null,
        resetToken: token,
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    return token;
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

  // Returns the updated user (rather than void) so the controller can log
  // the user straight in afterward — both the OTP-verified first-login path
  // and the emailed reset-link path land here, and neither should need to
  // re-enter credentials for a password they just finished proving they own.
  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException("This reset link is invalid or has expired");
    }

    const passwordHash = await this.hashPassword(newPassword);
    return this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, resetToken: null, resetTokenExpiresAt: null },
    });
  }

  // NOTE: single-active-session-per-test enforcement (design doc §11) lives
  // in the Attempts module, not here — this only governs general login
  // sessions. When wiring test start, check Redis for an existing
  // `attempt:{testId}:{studentId}` session before allowing a second one.
}

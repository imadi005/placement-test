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
  // happens. Case-insensitive on purpose: roll numbers are stored uppercase
  // and emails lowercase, so a student typing either in the "wrong" case
  // (very easy to do — nothing about the login form hints at a required
  // case) used to get a bare "Invalid credentials" for no real reason.
  // findFirst (not findUnique) because Prisma's `mode: "insensitive"` isn't
  // supported on findUnique's where clause.
  private async resolveUser(identifier: string) {
    const student = await this.prisma.student.findFirst({
      where: { rollNo: { equals: identifier, mode: "insensitive" } },
      include: { user: true },
    });

    return student
      ? student.user
      : this.prisma.user.findFirst({ where: { email: { equals: identifier, mode: "insensitive" } } });
  }

  async validateCredentials(identifier: string, password: string) {
    const user = await this.resolveUser(identifier);

    if (!user || !user.isActive) {
      // Runs a comparably-costly bcrypt op before rejecting so an unknown
      // identifier isn't measurably faster to reject than a known one with
      // a wrong password — otherwise response timing alone (not just the
      // error body) leaks which roll numbers/emails are real accounts.
      await bcrypt.compare(password, "$2b$12$CwTycUXWue0Thq9StjUM0uJ8vHW3Wnk3aFdMqSyOxeSBQGtN3f/oi");
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

  // Shared by both first-login and forgot-password — same mechanics either
  // way: generate a 6-digit code, hash+store it with a 10-minute expiry,
  // and fire off the email without awaiting it (SMTP can be slow or, on
  // some hosts, outright unreachable — the OTP is already saved, so the
  // caller's response shouldn't hang on mail delivery). A failed send just
  // means the email never arrives; the user can request a fresh OTP.
  private async generateAndSendOtp(user: { id: string; email: string }): Promise<void> {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const otpCodeHash = await bcrypt.hash(otp, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCodeHash, otpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    this.mail.sendOtpEmail(user.email, otp).catch((err) => {
      this.logger.error(`Failed to send OTP to ${user.email}: ${(err as Error).message}`);
    });
  }

  // First login (mustChangePassword still true) never gets a session token
  // straight away — it gets an OTP mailed to the account's own registered
  // address instead, and only reaches the password-set step once that's
  // proven. Returns a masked version of the address for the frontend to
  // show ("code sent to 25******58@kristujayanti.com").
  async sendFirstLoginOtp(user: { id: string; email: string }): Promise<string> {
    await this.generateAndSendOtp(user);
    return maskEmail(user.email);
  }

  // Shared by first-login and forgot-password (both write to the same
  // otpCodeHash/otpExpiresAt fields). Proves the OTP, then hands back a
  // one-time token — resetPassword() below is the single place a new
  // password actually gets written, regardless of which flow got the user
  // here.
  async verifyOtp(identifier: string, otp: string): Promise<string> {
    const user = await this.resolveUser(identifier);
    if (!user || !user.isActive || !user.otpCodeHash || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      // Same timing-equalization as validateCredentials/requestPasswordReset.
      await bcrypt.compare(otp, "$2b$12$CwTycUXWue0Thq9StjUM0uJ8vHW3Wnk3aFdMqSyOxeSBQGtN3f/oi");
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
  // roll numbers/emails. Same OTP mechanics as first-login now (an emailed
  // link was the original design, but it meant waiting on a college mail
  // server's spam-greylisting delay just to click through; a code the
  // user types back in is no slower to send and doesn't depend on the
  // reset link itself surviving forwarding/copy-paste).
  async requestPasswordReset(identifier: string) {
    const user = await this.resolveUser(identifier);
    if (!user || !user.isActive) {
      // Burns roughly the same time a real OTP-generation would (the bcrypt
      // hash dominates) so a valid vs. invalid identifier can't be told
      // apart by response timing either — the response body was already
      // identical either way, but timing alone was enough to distinguish
      // them (real accounts measurably slower than nonexistent ones).
      await bcrypt.hash("timing-equalizer", 12);
      return;
    }

    await this.generateAndSendOtp(user);
  }

  // Returns the updated user (rather than void) so the controller can log
  // the user straight in afterward — both the OTP-verified first-login path
  // and the emailed reset-link path land here, and neither should need to
  // re-enter credentials for a password they just finished proving they own.
  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.isActive || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
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

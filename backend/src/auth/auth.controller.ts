import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response, Request } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";

const REFRESH_COOKIE = "ptp_refresh_token";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/auth/refresh",
};

// Per-IP, so every student behind the same campus NAT shares this budget on
// exam day — 5 is fine for normal brute-force protection but starves a real
// cohort logging in together. Overridable via env for that scenario and for
// load testing, same pattern as GLOBAL_THROTTLE_LIMIT in app.module.ts.
const AUTH_THROTTLE_LIMIT = Number(process.env.AUTH_THROTTLE_LIMIT ?? 5);

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  // First login (mustChangePassword still true) never gets a session token
  // here — credentials just prove they know the temp password; an OTP to
  // their own registered email proves the account is actually theirs before
  // they're allowed to set a real password. Everyone else logs in as before.
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateCredentials(dto.identifier, dto.password);

    if (user.mustChangePassword) {
      const maskedEmail = await this.authService.sendFirstLoginOtp(user);
      return { otpRequired: true, identifier: dto.identifier, maskedEmail };
    }

    const { accessToken, refreshToken } = await this.authService.issueTokens(user.id, user.role);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);

    return {
      otpRequired: false,
      accessToken,
      user: { id: user.id, role: user.role, fullName: user.fullName },
      mustChangePassword: false,
    };
  }

  // Shared by first-login and forgot-password — both send an OTP to the
  // same otpCodeHash/otpExpiresAt fields, so one verify endpoint covers
  // either. On success, hands back the same one-time token the
  // reset-password screen needs to finish the job.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("verify-otp")
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const resetToken = await this.authService.verifyOtp(dto.identifier, dto.otp);
    return { resetToken };
  }

  // First-login forced change — the user is authenticated (JWT) but hasn't
  // set a real password yet.
  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  @HttpCode(200)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: { id: string }) {
    await this.authService.changePassword(user.id, dto.newPassword);
    return { success: true };
  }

  // Always returns the same generic response regardless of whether the
  // identifier matched an account — don't let this endpoint be used to
  // enumerate valid roll numbers/emails.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.identifier);
    return { message: "If an account exists for that identifier, a code has been sent to its registered email." };
  }

  // Logs the user straight in after a successful reset (OTP-verified
  // first-login and emailed reset-link both end up here) — they just
  // proved ownership of the account, no reason to make them type
  // credentials again immediately after.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.resetPassword(dto.token, dto.newPassword);
    const { accessToken, refreshToken } = await this.authService.issueTokens(user.id, user.role);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);

    return {
      accessToken,
      user: { id: user.id, role: user.role, fullName: user.fullName },
    };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException("No refresh token provided");

    const { accessToken, refreshToken } = await this.authService.refresh(token);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);

    return { accessToken };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: "/auth/refresh" });
    return { success: true };
  }
}

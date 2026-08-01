import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST");
    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASS");

    // No SMTP configured (the default for local/dev) — fall back to
    // logging the email instead of silently failing or crashing the
    // password-reset flow. Set SMTP_HOST/PORT/USER/PASS/FROM in .env to
    // send real mail.
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>("SMTP_PORT") ?? 587),
        secure: Number(this.config.get<string>("SMTP_PORT") ?? 587) === 465,
        auth: { user, pass },
        // On some hosts (e.g. a PaaS blocking outbound SMTP ports) a
        // connection just hangs instead of failing fast — without these,
        // an awaited sendMail() can stall a request indefinitely.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      });
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    const subject = "Reset your Placement Test Portal password";
    const text = `We received a request to reset your password.\n\nReset it here (valid for 1 hour): ${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;

    if (!this.transporter) {
      this.logger.warn(
        `SMTP not configured — printing reset email instead of sending it.\nTo: ${to}\nSubject: ${subject}\n${text}`
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.config.get<string>("SMTP_FROM") ?? "no-reply@kristujayanti.com",
      to,
      subject,
      text,
    });
  }

  async sendOtpEmail(to: string, otp: string) {
    const subject = "Your Placement Test Portal sign-in code";
    const text = `Your one-time code to finish signing in is: ${otp}\n\nThis code is valid for 10 minutes. If you didn't try to sign in, you can safely ignore this email.`;

    if (!this.transporter) {
      this.logger.warn(
        `SMTP not configured — printing OTP email instead of sending it.\nTo: ${to}\nSubject: ${subject}\n${text}`
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.config.get<string>("SMTP_FROM") ?? "no-reply@kristujayanti.com",
      to,
      subject,
      text,
    });
  }
}

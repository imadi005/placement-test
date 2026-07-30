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
}

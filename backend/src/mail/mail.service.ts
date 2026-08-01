import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly resendApiKey: string | undefined;
  private readonly resendFrom: string;

  constructor(private config: ConfigService) {
    // Resend (plain REST call, no SDK needed) is the preferred path — a
    // personal Gmail SMTP account is what caused OTP emails to take 1-2
    // minutes to land (college mail servers greylist/delay unfamiliar
    // senders). Resend is a transactional provider built for exactly this,
    // typically delivering in seconds. Falls back to SMTP, then to a
    // console log, so nothing breaks if RESEND_API_KEY isn't set yet.
    this.resendApiKey = this.config.get<string>("RESEND_API_KEY");
    this.resendFrom = this.config.get<string>("RESEND_FROM") ?? "Placement Test Portal <onboarding@resend.dev>";

    const host = this.config.get<string>("SMTP_HOST");
    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASS");

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

  private async send(to: string, subject: string, text: string) {
    if (this.resendApiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: this.resendFrom, to, subject, text }),
      });
      if (res.ok) return;

      // Resend's test domain (onboarding@resend.dev) can only deliver to
      // the account owner's own address until a real domain is verified —
      // every other recipient gets a 403 here. Falling through to SMTP (if
      // configured) means real recipients still get the email somehow
      // instead of silently getting nothing, while whoever owns the Resend
      // account still gets the fast path. Once a domain is verified this
      // branch stops being hit for anyone.
      this.logger.warn(`Resend API returned ${res.status} for ${to}: ${await res.text()} — falling back to SMTP.`);
    }

    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.config.get<string>("SMTP_FROM") ?? "no-reply@kristujayanti.com",
        to,
        subject,
        text,
      });
      return;
    }

    this.logger.warn(
      `No email provider configured — printing email instead of sending it.\nTo: ${to}\nSubject: ${subject}\n${text}`
    );
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    await this.send(
      to,
      "Reset your Placement Test Portal password",
      `We received a request to reset your password.\n\nReset it here (valid for 1 hour): ${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`
    );
  }

  async sendOtpEmail(to: string, otp: string) {
    await this.send(
      to,
      "Your Placement Test Portal sign-in code",
      `Your one-time code to finish signing in is: ${otp}\n\nThis code is valid for 10 minutes. If you didn't try to sign in, you can safely ignore this email.`
    );
  }
}

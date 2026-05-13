import { Injectable } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { EmailTransport, SendEmailInput } from './email.types';

@Injectable()
export class SmtpEmailTransport implements EmailTransport {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = createTransport({
      host: env.EMAIL_SMTP_HOST,
      port: env.EMAIL_SMTP_PORT ?? 587,
      secure: env.EMAIL_SMTP_SECURE,
      auth: env.EMAIL_SMTP_USER
        ? {
            user: env.EMAIL_SMTP_USER,
            pass: env.EMAIL_SMTP_PASS ?? '',
          }
        : undefined,
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }
}

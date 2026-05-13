import { Injectable, Logger } from '@nestjs/common';
import { EmailTransport, SendEmailInput } from './email.types';

@Injectable()
export class NoopEmailTransport implements EmailTransport {
  private readonly logger = new Logger(NoopEmailTransport.name);

  async send(input: SendEmailInput): Promise<void> {
    this.logger.log(
      `NOOP email sent to=${input.to} subject="${input.subject}"`,
    );
  }
}

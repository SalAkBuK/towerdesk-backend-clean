import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_TRANSPORT } from './email.constants';
import { EmailTransport, SendEmailInput } from './email.types';

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
  ) {}

  send(input: SendEmailInput): Promise<void> {
    return this.transport.send(input);
  }
}

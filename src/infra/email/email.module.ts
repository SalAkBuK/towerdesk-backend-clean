import { Module } from '@nestjs/common';
import { env } from '../../config/env';
import { EMAIL_TRANSPORT } from './email.constants';
import { EmailService } from './email.service';
import { NoopEmailTransport } from './noop-email.transport';
import { SmtpEmailTransport } from './smtp-email.transport';

@Module({
  providers: [
    NoopEmailTransport,
    SmtpEmailTransport,
    {
      provide: EMAIL_TRANSPORT,
      useFactory: (
        noopTransport: NoopEmailTransport,
        smtpTransport: SmtpEmailTransport,
      ) => {
        if (env.EMAIL_PROVIDER === 'smtp') {
          if (!env.EMAIL_FROM) {
            throw new Error('EMAIL_FROM is required when EMAIL_PROVIDER=smtp');
          }
          if (!env.EMAIL_SMTP_HOST) {
            throw new Error(
              'EMAIL_SMTP_HOST is required when EMAIL_PROVIDER=smtp',
            );
          }
          return smtpTransport;
        }

        return noopTransport;
      },
      inject: [NoopEmailTransport, SmtpEmailTransport],
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}

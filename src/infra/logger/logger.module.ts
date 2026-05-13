import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        autoLogging: false,
        genReqId: (req, res) => {
          const header = req.headers['x-request-id'];
          const requestId =
            typeof header === 'string' && header.length > 0
              ? header
              : randomUUID();
          (req as { requestId?: string }).requestId = requestId;
          res.setHeader('x-request-id', requestId);
          return requestId;
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Logger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';
import { env } from '../../config/env';
import { RequestContext } from '../types/request-context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<Response>();
    const start = Date.now();

    const requestId = request.requestId || randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start;
          if (env.HTTP_REQUEST_LOGGING_ENABLED) {
            this.logger.log(
              {
                requestId,
                method: request.method,
                path: request.originalUrl || request.url,
                statusCode: response.statusCode,
                durationMs,
              },
              'request completed',
            );
            return;
          }

          if (
            env.HTTP_SLOW_REQUEST_THRESHOLD_MS > 0 &&
            durationMs >= env.HTTP_SLOW_REQUEST_THRESHOLD_MS
          ) {
            this.logger.warn(
              {
                requestId,
                method: request.method,
                path: request.originalUrl || request.url,
                statusCode: response.statusCode,
                durationMs,
              },
              'slow request',
            );
          }
        },
        error: (error) => {
          const durationMs = Date.now() - start;
          this.logger.warn(
            {
              requestId,
              method: request.method,
              path: request.originalUrl || request.url,
              statusCode: response.statusCode,
              durationMs,
              error,
            },
            'request failed',
          );
        },
      }),
    );
  }
}

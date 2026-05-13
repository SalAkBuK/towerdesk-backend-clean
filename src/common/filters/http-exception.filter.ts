import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { RequestContext } from '../types/request-context';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestContext>();
    const requestId = request.requestId || request.headers['x-request-id'];

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const errorResponse = this.mapHttpException(
        payload,
        exception,
        requestId,
      );
      response.status(status).json(errorResponse);
      return;
    }

    this.logger.error(exception);

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
      requestId: typeof requestId === 'string' ? requestId : undefined,
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorResponse);
  }

  private mapHttpException(
    payload: string | object,
    exception: HttpException,
    requestId?: string | string[],
  ): ErrorResponse {
    let code = exception.name;
    let message = exception.message;
    let details: unknown;

    if (typeof payload === 'string') {
      message = payload;
    } else if (payload && typeof payload === 'object') {
      const data = payload as Record<string, unknown>;
      if (typeof data.error === 'string') {
        code = data.error;
      }
      if (Array.isArray(data.message)) {
        message = 'Validation failed';
        details = data.message;
      } else if (typeof data.message === 'string') {
        message = data.message;
      }
    }

    return {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId: typeof requestId === 'string' ? requestId : undefined,
    };
  }
}

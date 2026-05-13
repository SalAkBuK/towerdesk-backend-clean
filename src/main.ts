import { NestInterceptor } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import compression from 'compression';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestMetricsInterceptor } from './common/interceptors/request-metrics.interceptor';
import { env } from './config/env';
import { RequestMetricsService } from './infra/metrics/request-metrics.service';

async function bootstrap() {
  if (env.APP_RUNTIME !== 'api') {
    throw new Error(
      `HTTP bootstrap requires APP_RUNTIME=api. Current runtime is ${env.APP_RUNTIME}.`,
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  const metricsService = app.get(RequestMetricsService);
  const interceptors: NestInterceptor[] = [new LoggingInterceptor(logger)];
  if (env.REQUEST_METRICS_ENABLED) {
    interceptors.push(new RequestMetricsInterceptor(metricsService));
  }

  app.set('trust proxy', true);
  app.enableCors({ origin: true });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          connectSrc: [
            "'self'",
            'https://api.cloudinary.com',
            'http://localhost:3001',
            'ws://localhost:3001',
          ],
        },
      },
    }),
  );
  app.use(compression());
  app.use(json({ limit: env.HTTP_BODY_LIMIT ?? '1mb' }));
  app.use(urlencoded({ extended: true, limit: env.HTTP_BODY_LIMIT ?? '1mb' }));
  app.useLogger(logger);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(...interceptors);
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Towerdesk Backend')
      .setDescription('API documentation')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT) || env.PORT || 3000;
  const server = app.getHttpServer();
  const timeoutMs = env.HTTP_SERVER_TIMEOUT_MS ?? 30000;
  const headersTimeoutMs = env.HTTP_HEADERS_TIMEOUT_MS ?? 35000;
  const keepAliveTimeoutMs = env.HTTP_KEEP_ALIVE_TIMEOUT_MS ?? 5000;
  server.setTimeout(timeoutMs);
  if (typeof server.headersTimeout === 'number') {
    server.headersTimeout = headersTimeoutMs;
  }
  if (typeof server.keepAliveTimeout === 'number') {
    server.keepAliveTimeout = keepAliveTimeoutMs;
  }
  await app.listen(port, '0.0.0.0');
}

bootstrap();

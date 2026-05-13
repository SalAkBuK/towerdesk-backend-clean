import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { env } from './config/env';
import { WorkerModule } from './worker.module';

async function bootstrapWorker() {
  if (env.APP_RUNTIME !== 'worker') {
    throw new Error(
      `Worker bootstrap requires APP_RUNTIME=worker. Current runtime is ${env.APP_RUNTIME}.`,
    );
  }

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.enableShutdownHooks();

  logger.log('Delivery worker context started');
}

bootstrapWorker();

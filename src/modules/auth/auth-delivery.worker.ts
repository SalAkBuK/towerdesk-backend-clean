import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { env } from '../../config/env';
import { DELIVERY_QUEUE_NAMES } from '../../infra/queue/delivery-task.types';
import { QueueService } from '../../infra/queue/queue.service';
import { AuthPasswordDeliveryService } from './auth-password-delivery.service';

@Injectable()
export class AuthDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthDeliveryWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly authPasswordDeliveryService: AuthPasswordDeliveryService,
  ) {}

  onModuleInit() {
    if (env.APP_RUNTIME !== 'worker') {
      return;
    }

    this.worker = this.queueService.createWorker(
      DELIVERY_QUEUE_NAMES.AUTH_EMAIL,
      async (job) => {
        const taskId = job.data?.taskId;
        if (typeof taskId !== 'string' || !taskId) {
          return;
        }
        await this.authPasswordDeliveryService.processTask(taskId);
      },
      { concurrency: 2 },
    );

    this.worker?.on('failed', (job, error) => {
      this.logger.warn(
        `Auth delivery job failed task=${job?.data?.taskId ?? 'unknown'}: ${error.message}`,
      );
    });
  }

  async onModuleDestroy() {
    await this.queueService.closeWorker(this.worker);
  }
}

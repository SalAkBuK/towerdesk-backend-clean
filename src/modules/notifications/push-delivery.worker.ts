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
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class PushDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDeliveryWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  onModuleInit() {
    if (env.APP_RUNTIME !== 'worker') {
      return;
    }

    this.worker = this.queueService.createWorker(
      DELIVERY_QUEUE_NAMES.PUSH,
      async (job) => {
        const taskId = job.data?.taskId;
        if (typeof taskId !== 'string' || !taskId) {
          return;
        }
        await this.pushNotificationsService.processDeliveryTask(taskId);
      },
      { concurrency: 3 },
    );

    this.worker?.on('failed', (job, error) => {
      this.logger.warn(
        `Push delivery job failed task=${job?.data?.taskId ?? 'unknown'}: ${error.message}`,
      );
    });
  }

  async onModuleDestroy() {
    await this.queueService.closeWorker(this.worker);
  }
}

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
import { BroadcastDeliveryService } from './broadcast-delivery.service';

@Injectable()
export class BroadcastDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastDeliveryWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly broadcastDeliveryService: BroadcastDeliveryService,
  ) {}

  onModuleInit() {
    if (env.APP_RUNTIME !== 'worker') {
      return;
    }

    this.worker = this.queueService.createWorker(
      DELIVERY_QUEUE_NAMES.BROADCAST,
      async (job) => {
        const taskId = job.data?.taskId;
        if (typeof taskId !== 'string' || !taskId) {
          return;
        }
        await this.broadcastDeliveryService.processTask(taskId);
      },
      { concurrency: 2 },
    );

    this.worker?.on('failed', (job, error) => {
      this.logger.warn(
        `Broadcast delivery job failed task=${job?.data?.taskId ?? 'unknown'}: ${error.message}`,
      );
    });
  }

  async onModuleDestroy() {
    await this.queueService.closeWorker(this.worker);
  }
}

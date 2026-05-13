import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DeliveryTaskStatus } from '@prisma/client';
import { env } from '../../config/env';
import { DeliveryTasksRepo } from './delivery-tasks.repo';

@Injectable()
export class DeliveryTaskRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DeliveryTaskRetentionService.name);
  private readonly enabled =
    env.APP_RUNTIME === 'worker' && env.DELIVERY_TASK_RETENTION_ENABLED;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly deliveryTasksRepo: DeliveryTasksRepo) {}

  onModuleInit() {
    if (!this.enabled) {
      return;
    }

    this.timer = setInterval(() => {
      void this.pruneExpiredTasks().catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        this.logger.error(`Delivery task retention run failed: ${message}`);
      });
    }, env.DELIVERY_TASK_RETENTION_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async pruneExpiredTasks(input?: {
    olderThanDays?: number;
    statuses?: DeliveryTaskStatus[];
    dryRun?: boolean;
  }) {
    const olderThanDays =
      input?.olderThanDays ?? env.DELIVERY_TASK_RETENTION_DAYS;
    const olderThan = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );
    const statuses = input?.statuses ?? [
      DeliveryTaskStatus.SUCCEEDED,
      DeliveryTaskStatus.FAILED,
      DeliveryTaskStatus.RETRIED,
    ];

    const result = await this.deliveryTasksRepo.cleanupTerminalOlderThan({
      olderThan,
      statuses,
      dryRun: input?.dryRun,
    });

    this.logger.log(
      `Delivery task retention ${input?.dryRun ? 'scan' : 'cleanup'} removed ${result.count} task(s) older than ${olderThan.toISOString()}`,
    );

    return {
      count: result.count,
      olderThan,
      olderThanDays,
      statuses,
      dryRun: input?.dryRun ?? false,
    };
  }
}

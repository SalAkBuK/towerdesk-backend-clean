import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryTasksRepo } from './delivery-tasks.repo';
import { DeliveryTaskRetentionService } from './delivery-task-retention.service';
import { QueueService } from './queue.service';
import { QueueRuntimeGuardService } from './queue-runtime-guard.service';
import { QUEUE_CONNECTION } from './queue.tokens';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: QUEUE_CONNECTION,
      useFactory: () => {
        if (!env.QUEUE_ENABLED) {
          return null;
        }
        return new Redis({
          host: env.QUEUE_HOST || '127.0.0.1',
          port: env.QUEUE_PORT || 6379,
          password: env.QUEUE_PASSWORD,
          maxRetriesPerRequest: null,
        });
      },
    },
    {
      provide: QueueService,
      useFactory: (connection: Redis | null) => new QueueService(connection),
      inject: [QUEUE_CONNECTION],
    },
    DeliveryTasksRepo,
    DeliveryTaskRetentionService,
    QueueRuntimeGuardService,
  ],
  exports: [
    QUEUE_CONNECTION,
    QueueService,
    DeliveryTasksRepo,
    DeliveryTaskRetentionService,
  ],
})
export class QueueModule {}

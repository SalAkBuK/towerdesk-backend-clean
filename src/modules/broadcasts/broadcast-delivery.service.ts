import { Injectable, Logger } from '@nestjs/common';
import { DeliveryTaskKind, NotificationType } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DeliveryTasksRepo } from '../../infra/queue/delivery-tasks.repo';
import {
  BroadcastFanoutDeliveryPayload,
  DELIVERY_JOB_NAMES,
  DELIVERY_QUEUE_NAMES,
  DELIVERY_RETRY_CONFIG,
  DeliveryTaskRecord,
} from '../../infra/queue/delivery-task.types';
import { QueueService } from '../../infra/queue/queue.service';
import { NotificationsRepo } from '../notifications/notifications.repo';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationTypeEnum } from '../notifications/notifications.constants';

@Injectable()
export class BroadcastDeliveryService {
  private readonly logger = new Logger(BroadcastDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryTasksRepo: DeliveryTasksRepo,
    private readonly queueService: QueueService,
    private readonly notificationsRepo: NotificationsRepo,
    private readonly notificationsService: NotificationsService,
  ) {}

  async enqueueFanout(payload: BroadcastFanoutDeliveryPayload) {
    await this.enqueueFanoutTask(payload);
  }

  async enqueueFanoutTask(payload: BroadcastFanoutDeliveryPayload) {
    const task = await this.deliveryTasksRepo.create({
      kind: DeliveryTaskKind.BROADCAST_FANOUT,
      queueName: DELIVERY_QUEUE_NAMES.BROADCAST,
      jobName: DELIVERY_JOB_NAMES.BROADCAST_FANOUT,
      orgId: payload.orgId,
      userId: payload.senderUserId,
      referenceType: 'BROADCAST',
      referenceId: payload.broadcastId,
      maxAttempts: DELIVERY_RETRY_CONFIG.BROADCAST.attempts,
      payload,
    });
    await this.dispatchTask(task);
    return task;
  }

  async retryTask(task: DeliveryTaskRecord) {
    return this.enqueueFanoutTask(
      task.payload as BroadcastFanoutDeliveryPayload,
    );
  }

  private async dispatchTask(task: DeliveryTaskRecord) {
    const queueOptions = {
      jobId: task.id,
      attempts: task.maxAttempts,
      backoff: {
        type: 'exponential' as const,
        delay: DELIVERY_RETRY_CONFIG.BROADCAST.backoffMs,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    };

    try {
      const queued = await this.queueService.enqueue(
        task.queueName,
        task.jobName,
        { taskId: task.id },
        queueOptions,
      );
      if (queued) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Queue enqueue failed for broadcast delivery task ${task.id}: ${message}`,
      );
    }

    await this.processTask(task.id, false);
  }

  async processTask(taskId: string, allowThrow = true) {
    const task = await this.deliveryTasksRepo.findById(taskId);
    if (!task || task.kind !== DeliveryTaskKind.BROADCAST_FANOUT) {
      return;
    }
    if (task.status === 'SUCCEEDED' || task.status === 'RETRIED') {
      return;
    }

    const processing = await this.deliveryTasksRepo.markProcessing(taskId);
    if (
      !processing ||
      processing.status === 'SUCCEEDED' ||
      processing.status === 'RETRIED'
    ) {
      return;
    }

    const payload = processing.payload as BroadcastFanoutDeliveryPayload;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const current = await this.deliveryTasksRepo.findById(taskId, tx);
        if (current?.status === 'SUCCEEDED') {
          return [];
        }

        const notifications = payload.userIds.map((userId) => ({
          orgId: payload.orgId,
          recipientUserId: userId,
          type: NotificationType.BROADCAST,
          title: payload.title,
          body: payload.body ?? null,
          data: {
            broadcastId: payload.broadcastId,
            buildingIds: payload.buildingIds,
            senderUserId: payload.senderUserId,
            metadata: payload.metadata,
          },
        }));

        const createdRows = await this.notificationsRepo.createManyAndReturn(
          notifications,
          tx,
        );
        await this.deliveryTasksRepo.markSucceeded(taskId, tx);
        return createdRows;
      });

      if (created.length > 0) {
        this.notificationsService.publishCreatedNotifications(
          payload.orgId,
          created,
        );
        try {
          await this.notificationsService.queuePushForNotificationBatch({
            orgId: payload.orgId,
            userIds: payload.userIds,
            type: NotificationTypeEnum.BROADCAST,
            title: payload.title,
            body: payload.body ?? undefined,
            data: {
              broadcastId: payload.broadcastId,
              buildingIds: payload.buildingIds,
              senderUserId: payload.senderUserId,
              metadata: payload.metadata,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'unknown error';
          this.logger.error(
            `Broadcast fan-out push queueing failed after notifications were committed for task=${taskId} broadcast=${payload.broadcastId}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const exhausted = processing.attemptCount >= processing.maxAttempts;

      if (exhausted) {
        await this.deliveryTasksRepo.markFailed(taskId, message);
      } else {
        await this.deliveryTasksRepo.markRetryScheduled(taskId, message);
      }

      this.logger.error(
        `Broadcast fan-out failed for task=${taskId} broadcast=${payload.broadcastId}: ${message}`,
      );

      if (allowThrow) {
        throw error;
      }
    }
  }
}

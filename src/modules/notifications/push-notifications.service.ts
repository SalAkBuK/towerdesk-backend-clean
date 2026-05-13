import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryTaskKind,
  PushDeliveryReceiptStatus,
  PushDevice,
  PushPlatform,
  PushProvider,
} from '@prisma/client';
import { env } from '../../config/env';
import { DeliveryTasksRepo } from '../../infra/queue/delivery-tasks.repo';
import {
  DELIVERY_JOB_NAMES,
  DELIVERY_QUEUE_NAMES,
  DELIVERY_RETRY_CONFIG,
  DeliveryTaskRecord,
  PushNotificationDeliveryPayload,
} from '../../infra/queue/delivery-task.types';
import { QueueService } from '../../infra/queue/queue.service';
import { PushDevicesRepo } from './push-devices.repo';
import { PushDeliveryReceiptsRepo } from './push-delivery-receipts.repo';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UpdatePushDeviceDto } from './dto/update-push-device.dto';

type PushAudienceInput = {
  orgId: string;
  userIds: string[];
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private static readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  constructor(
    private readonly pushDevicesRepo: PushDevicesRepo,
    private readonly deliveryTasksRepo: DeliveryTasksRepo,
    private readonly queueService: QueueService,
    private readonly pushDeliveryReceiptsRepo: PushDeliveryReceiptsRepo,
  ) {}

  async registerDevice(
    userId: string,
    orgId: string,
    dto: RegisterPushDeviceDto,
  ) {
    const payload = this.normalizeRegisterPayload(dto);
    return this.pushDevicesRepo.register({
      orgId,
      userId,
      ...payload,
    });
  }

  async registerOwnerDevice(userId: string, dto: RegisterPushDeviceDto) {
    const payload = this.normalizeRegisterPayload(dto);
    return this.pushDevicesRepo.register({
      orgId: null,
      userId,
      ...payload,
    });
  }

  async updateDevice(
    userId: string,
    deviceId: string,
    dto: UpdatePushDeviceDto,
    orgId: string | null = null,
  ) {
    const existing = await this.pushDevicesRepo.findByIdForUser(
      deviceId,
      userId,
    );
    if (!existing) {
      throw new NotFoundException('Push device not found');
    }

    const provider = dto.provider ?? existing.provider;
    const token = dto.token?.trim() || existing.token;
    if (!token) {
      throw new BadRequestException('Push token is required');
    }
    if (provider === PushProvider.EXPO && !this.isExpoPushToken(token)) {
      throw new BadRequestException('Invalid Expo push token');
    }

    return this.pushDevicesRepo.updateForUser(deviceId, userId, {
      orgId,
      provider,
      platform: dto.platform ?? existing.platform ?? PushPlatform.UNKNOWN,
      token,
      deviceId:
        dto.deviceId === undefined
          ? (existing.deviceId ?? undefined)
          : dto.deviceId.trim() || undefined,
      appId:
        dto.appId === undefined
          ? (existing.appId ?? undefined)
          : dto.appId.trim() || undefined,
    });
  }

  async unregisterDevice(userId: string, orgId: string, token: string) {
    const normalized = token.trim();
    if (!normalized) {
      throw new BadRequestException('Push token is required');
    }

    await this.pushDevicesRepo.deactivateForUser(orgId, userId, normalized);
  }

  async removeDevice(userId: string, deviceId: string) {
    const deactivated = await this.pushDevicesRepo.deactivateByIdForUser(
      deviceId,
      userId,
    );
    if (deactivated === 0) {
      throw new NotFoundException('Push device not found');
    }
  }

  async sendToUsers(input: PushAudienceInput) {
    if (env.PUSH_PROVIDER === 'noop') {
      return;
    }

    const userIds = Array.from(new Set(input.userIds)).filter(Boolean);
    if (userIds.length === 0) {
      return;
    }

    await this.enqueueDelivery({
      orgId: input.orgId,
      userIds,
      title: input.title,
      body: input.body,
      data: input.data,
    });
  }

  async enqueueDelivery(input: PushNotificationDeliveryPayload) {
    const task = await this.deliveryTasksRepo.create({
      kind: DeliveryTaskKind.PUSH_NOTIFICATION,
      queueName: DELIVERY_QUEUE_NAMES.PUSH,
      jobName: DELIVERY_JOB_NAMES.PUSH_NOTIFICATION,
      orgId: input.orgId,
      maxAttempts: DELIVERY_RETRY_CONFIG.PUSH.attempts,
      payload: {
        orgId: input.orgId,
        userIds: input.userIds,
        title: input.title,
        body: input.body,
        data: input.data,
      },
    });
    await this.dispatchTask(task);
    return task;
  }

  async retryTask(task: DeliveryTaskRecord) {
    return this.enqueueDelivery(
      task.payload as PushNotificationDeliveryPayload,
    );
  }

  private async dispatchTask(task: DeliveryTaskRecord) {
    const queueOptions = {
      jobId: task.id,
      attempts: task.maxAttempts,
      backoff: {
        type: 'exponential' as const,
        delay: DELIVERY_RETRY_CONFIG.PUSH.backoffMs,
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
        `Queue enqueue failed for push delivery task ${task.id}: ${message}`,
      );
    }

    await this.processDeliveryTask(task.id, false);
  }

  async processDeliveryTask(taskId: string, allowThrow = true) {
    const task = await this.deliveryTasksRepo.findById(taskId);
    if (!task || task.kind !== DeliveryTaskKind.PUSH_NOTIFICATION) {
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

    try {
      await this.deliverToUsersNow(
        taskId,
        processing.payload as PushNotificationDeliveryPayload,
      );
      await this.deliveryTasksRepo.markSucceeded(taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const exhausted = processing.attemptCount >= processing.maxAttempts;

      if (exhausted) {
        await this.deliveryTasksRepo.markFailed(taskId, message);
      } else {
        await this.deliveryTasksRepo.markRetryScheduled(taskId, message);
      }

      this.logger.error(`Push delivery failed for task=${taskId}: ${message}`);
      if (allowThrow) {
        throw error;
      }
    }
  }

  async deliverToUsersNow(
    taskId: string,
    input: PushNotificationDeliveryPayload,
  ) {
    const devices = await this.pushDevicesRepo.listActiveForAudience(
      input.orgId,
      input.userIds,
    );
    if (devices.length === 0) {
      return;
    }

    if (env.PUSH_PROVIDER === 'expo') {
      await this.sendExpo(taskId, devices, input);
    }
  }

  private async sendExpo(
    taskId: string,
    devices: PushDevice[],
    input: PushAudienceInput | PushNotificationDeliveryPayload,
  ) {
    const recipients = devices.filter(
      (device) =>
        device.provider === PushProvider.EXPO &&
        this.isExpoPushToken(device.token),
    );
    if (recipients.length === 0) {
      return;
    }

    for (const chunk of this.chunk(recipients, 100)) {
      const response = await fetch(PushNotificationsService.expoPushUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(env.PUSH_EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${env.PUSH_EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(
          chunk.map((device) => ({
            to: device.token,
            title: input.title,
            body: input.body,
            data: input.data ?? {},
            sound: 'default',
            priority: 'high',
          })),
        ),
      });

      if (!response.ok) {
        throw new Error(`Expo push send failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { data?: ExpoPushTicket[] };
      await this.handleExpoTickets(taskId, chunk, payload.data ?? []);
    }
  }

  private async handleExpoTickets(
    taskId: string,
    devices: PushDevice[],
    tickets: ExpoPushTicket[],
  ) {
    const invalidDeviceIds: string[] = [];
    const now = new Date();
    const receiptRows = tickets.flatMap((ticket, index) => {
      const device = devices[index];
      if (!device) {
        return [];
      }

      if (ticket.status === 'error') {
        if (ticket.details?.error === 'DeviceNotRegistered') {
          invalidDeviceIds.push(device.id);
        }

        this.logger.warn(
          {
            provider: 'expo',
            token: this.maskToken(device.token),
            error: ticket.details?.error ?? ticket.message ?? 'unknown',
          },
          'push ticket returned error',
        );
      } else if (env.PUSH_LOG_DELIVERIES) {
        this.logger.debug(
          {
            provider: 'expo',
            token: this.maskToken(device.token),
            ticketId: ticket.id,
          },
          'push queued',
        );
      }

      return [
        {
          taskId,
          provider: device.provider,
          platform: device.platform,
          userId: device.userId,
          pushDeviceId: device.id,
          deviceTokenMasked: this.maskToken(device.token),
          providerTicketId: ticket.id ?? null,
          providerReceiptId: ticket.id ?? null,
          status:
            ticket.status === 'ok'
              ? PushDeliveryReceiptStatus.PENDING
              : PushDeliveryReceiptStatus.ERROR,
          errorCode:
            ticket.status === 'error' ? (ticket.details?.error ?? null) : null,
          errorMessage:
            ticket.status === 'error' ? (ticket.message ?? 'unknown') : null,
          details: ticket.details ?? null,
          checkedAt: ticket.status === 'error' ? now : null,
        },
      ];
    });

    await this.pushDeliveryReceiptsRepo.createMany(receiptRows);
    await this.pushDevicesRepo.deactivateByIds(invalidDeviceIds);
  }

  private isExpoPushToken(token: string) {
    return /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
  }

  private normalizeRegisterPayload(dto: RegisterPushDeviceDto) {
    const token = dto.token.trim();
    if (!token) {
      throw new BadRequestException('Push token is required');
    }

    if (dto.provider === PushProvider.EXPO && !this.isExpoPushToken(token)) {
      throw new BadRequestException('Invalid Expo push token');
    }

    return {
      provider: dto.provider,
      platform: dto.platform ?? PushPlatform.UNKNOWN,
      token,
      deviceId: dto.deviceId?.trim() || undefined,
      appId: dto.appId?.trim() || undefined,
    };
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private maskToken(token: string) {
    if (token.length <= 10) {
      return token;
    }
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryTaskKind, DeliveryTaskStatus } from '@prisma/client';
import { DeliveryTaskRetentionService } from '../../infra/queue/delivery-task-retention.service';
import { DeliveryTasksRepo } from '../../infra/queue/delivery-tasks.repo';
import { DeliveryTaskRecord } from '../../infra/queue/delivery-task.types';
import { AuthPasswordDeliveryService } from '../auth/auth-password-delivery.service';
import { BroadcastDeliveryService } from '../broadcasts/broadcast-delivery.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { PushDeliveryReceiptsRepo } from '../notifications/push-delivery-receipts.repo';
import { ListDeliveryTasksQueryDto } from './dto/list-delivery-tasks.query.dto';
import { DeliveryTaskResponseDto } from './dto/delivery-task.response.dto';
import {
  CleanupDeliveryTasksDto,
  PushDeliveryReceiptDto,
  RetryFailedDeliveryTasksDto,
} from './dto/delivery-task-ops.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class PlatformDeliveryTasksService {
  constructor(
    private readonly deliveryTasksRepo: DeliveryTasksRepo,
    private readonly deliveryTaskRetentionService: DeliveryTaskRetentionService,
    private readonly authPasswordDeliveryService: AuthPasswordDeliveryService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly pushDeliveryReceiptsRepo: PushDeliveryReceiptsRepo,
    private readonly broadcastDeliveryService: BroadcastDeliveryService,
  ) {}

  async list(query: ListDeliveryTasksQueryDto) {
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const cursorInfo = query.cursor
      ? this.decodeCursor(query.cursor)
      : undefined;

    const items = await this.deliveryTasksRepo.list({
      kind: query.kind,
      status: query.status,
      orgId: query.orgId,
      referenceType: query.referenceType,
      referenceId: query.referenceId,
      lastErrorContains: query.lastErrorContains,
      take: limit + 1,
      cursor: cursorInfo,
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(sliced[sliced.length - 1])
      : undefined;
    const receiptSummaryByTaskId =
      await this.pushDeliveryReceiptsRepo.summarizeByTaskIds(
        sliced
          .filter((item) => item.kind === DeliveryTaskKind.PUSH_NOTIFICATION)
          .map((item) => item.id),
      );

    return {
      items: sliced.map((item) =>
        this.toResponse(item, {
          receiptSummary:
            item.kind === DeliveryTaskKind.PUSH_NOTIFICATION
              ? (receiptSummaryByTaskId.get(item.id) ?? null)
              : null,
        }),
      ),
      nextCursor,
    };
  }

  async getById(taskId: string) {
    const task = await this.deliveryTasksRepo.findById(taskId);
    if (!task) {
      throw new NotFoundException('Delivery task not found');
    }
    const providerReceipts =
      task.kind === DeliveryTaskKind.PUSH_NOTIFICATION
        ? await this.pushDeliveryReceiptsRepo.listByTaskId(task.id)
        : [];
    return this.toResponse(task, {
      receiptSummary:
        task.kind === DeliveryTaskKind.PUSH_NOTIFICATION
          ? this.summarizeReceipts(providerReceipts)
          : null,
      providerReceipts:
        task.kind === DeliveryTaskKind.PUSH_NOTIFICATION
          ? providerReceipts.map((receipt) => this.toProviderReceipt(receipt))
          : [],
    });
  }

  async summary(query: ListDeliveryTasksQueryDto) {
    const summary = await this.deliveryTasksRepo.summarize({
      kind: query.kind,
      status: query.status,
      orgId: query.orgId,
      referenceType: query.referenceType,
      referenceId: query.referenceId,
      lastErrorContains: query.lastErrorContains,
    });

    return {
      total: summary.total,
      failedCount: summary.failedCount,
      oldestFailedAt: summary.oldestFailedAt,
      newestFailedAt: summary.newestFailedAt,
      byStatus: Object.entries(summary.byStatus)
        .map(([status, count]) => ({
          status: status as DeliveryTaskStatus,
          count,
        }))
        .sort((a, b) => a.status.localeCompare(b.status)),
      byKind: Object.entries(summary.byKind)
        .map(([kind, count]) => ({
          kind: kind as DeliveryTaskKind,
          count,
        }))
        .sort((a, b) => a.kind.localeCompare(b.kind)),
      topErrors: summary.topErrors.map((entry) => ({
        kind: entry.kind as DeliveryTaskKind,
        lastError: entry.lastError,
        count: entry.count,
      })),
    };
  }

  async retryFailed(dto: RetryFailedDeliveryTasksDto) {
    const limit = Math.min(Math.max(dto.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const failedTasks = await this.deliveryTasksRepo.list({
      kind: dto.kind,
      status: DeliveryTaskStatus.FAILED,
      orgId: dto.orgId,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      lastErrorContains: dto.lastErrorContains,
      take: limit,
    });

    const replacementTaskIds: string[] = [];
    for (const task of failedTasks) {
      const result = await this.retry(task.id);
      replacementTaskIds.push(result.task.id);
    }

    return {
      requested: failedTasks.length,
      retried: replacementTaskIds.length,
      sourceTaskIds: failedTasks.map((task) => task.id),
      replacementTaskIds,
    };
  }

  async cleanup(dto: CleanupDeliveryTasksDto) {
    const statuses = dto.statuses?.length
      ? dto.statuses
      : [
          DeliveryTaskStatus.SUCCEEDED,
          DeliveryTaskStatus.FAILED,
          DeliveryTaskStatus.RETRIED,
        ];
    const invalidStatuses = statuses.filter(
      (status) =>
        status !== DeliveryTaskStatus.SUCCEEDED &&
        status !== DeliveryTaskStatus.FAILED &&
        status !== DeliveryTaskStatus.RETRIED,
    );
    if (invalidStatuses.length > 0) {
      throw new BadRequestException(
        'Cleanup only supports terminal delivery task statuses',
      );
    }

    return this.deliveryTaskRetentionService.pruneExpiredTasks({
      olderThanDays: dto.olderThanDays,
      statuses,
      dryRun: dto.dryRun,
    });
  }

  async retry(taskId: string) {
    const task = await this.deliveryTasksRepo.findById(taskId);
    if (!task) {
      throw new NotFoundException('Delivery task not found');
    }

    const claimed = await this.deliveryTasksRepo.claimForRetry(taskId);
    if (!claimed) {
      const current = await this.deliveryTasksRepo.findById(taskId);
      if (!current) {
        throw new NotFoundException('Delivery task not found');
      }
      if (current.status === DeliveryTaskStatus.RETRIED) {
        throw new ConflictException('Delivery task has already been retried');
      }
      if (current.status !== DeliveryTaskStatus.FAILED) {
        throw new ConflictException(
          'Only failed delivery tasks can be retried',
        );
      }
      if (current.retriedAt || current.replacedByTaskId) {
        throw new ConflictException('Delivery task has already been retried');
      }
      throw new ConflictException('Delivery task retry is already in progress');
    }

    let retried: DeliveryTaskRecord;
    try {
      retried = await this.retryByKind(claimed);
    } catch (error) {
      await this.deliveryTasksRepo.releaseRetryClaim(taskId);
      throw error;
    }

    await this.deliveryTasksRepo.markRetried(taskId, retried.id);
    return {
      sourceTaskId: taskId,
      task: this.toResponse(retried),
    };
  }

  private async retryByKind(task: DeliveryTaskRecord) {
    switch (task.kind) {
      case DeliveryTaskKind.AUTH_PASSWORD_EMAIL:
        return this.authPasswordDeliveryService.retryTask(task);
      case DeliveryTaskKind.PUSH_NOTIFICATION:
        return this.pushNotificationsService.retryTask(task);
      case DeliveryTaskKind.BROADCAST_FANOUT:
        return this.broadcastDeliveryService.retryTask(task);
      default:
        throw new BadRequestException('Unsupported delivery task kind');
    }
  }

  private toResponse(
    task: DeliveryTaskRecord,
    options?: {
      receiptSummary?: {
        total: number;
        pending: number;
        delivered: number;
        error: number;
        latestCheckedAt: Date | null;
      } | null;
      providerReceipts?: PushDeliveryReceiptDto[];
    },
  ): DeliveryTaskResponseDto {
    return {
      id: task.id,
      kind: task.kind,
      status: task.status,
      queueName: task.queueName,
      jobName: task.jobName,
      orgId: task.orgId,
      userId: task.userId,
      referenceType: task.referenceType,
      referenceId: task.referenceId,
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts,
      queuedAt: task.queuedAt,
      lastAttemptAt: task.lastAttemptAt,
      processingStartedAt: task.processingStartedAt,
      completedAt: task.completedAt,
      lastError: task.lastError,
      retriedAt: task.retriedAt,
      replacedByTaskId: task.replacedByTaskId,
      payloadSummary: this.buildPayloadSummary(task),
      receiptSummary: options?.receiptSummary ?? null,
      providerReceipts: options?.providerReceipts ?? [],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private buildPayloadSummary(task: DeliveryTaskRecord) {
    if (task.kind === DeliveryTaskKind.AUTH_PASSWORD_EMAIL) {
      const payload = task.payload as {
        email: string;
        purpose: string;
        expiresAt: string;
        context?: { inviteeName?: string | null; inviterName?: string | null };
      };
      return {
        email: payload.email,
        purpose: payload.purpose,
        expiresAt: payload.expiresAt,
        inviteeName: payload.context?.inviteeName ?? null,
        inviterName: payload.context?.inviterName ?? null,
      };
    }

    if (task.kind === DeliveryTaskKind.PUSH_NOTIFICATION) {
      const payload = task.payload as {
        orgId: string;
        userIds: string[];
        title: string;
        body?: string;
        data?: Record<string, unknown>;
      };
      return {
        orgId: payload.orgId,
        userCount: payload.userIds.length,
        title: payload.title,
        bodyPreview: payload.body ? payload.body.slice(0, 160) : null,
        dataKeys: Object.keys(payload.data ?? {}).sort(),
      };
    }

    if (task.kind === DeliveryTaskKind.BROADCAST_FANOUT) {
      const payload = task.payload as {
        broadcastId: string;
        orgId: string;
        userIds: string[];
        title: string;
        body?: string | null;
        senderUserId: string;
        buildingIds: string[];
        metadata: Record<string, unknown>;
      };
      return {
        broadcastId: payload.broadcastId,
        orgId: payload.orgId,
        senderUserId: payload.senderUserId,
        userCount: payload.userIds.length,
        buildingCount: payload.buildingIds.length,
        title: payload.title,
        bodyPreview: payload.body ? payload.body.slice(0, 160) : null,
        metadataKeys: Object.keys(payload.metadata ?? {}).sort(),
      };
    }

    return {};
  }

  private encodeCursor(task: { id: string; createdAt: Date }) {
    return Buffer.from(
      `${task.createdAt.toISOString()}|${task.id}`,
      'utf8',
    ).toString('base64');
  }

  private decodeCursor(cursor: string) {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    const parts = decoded.split('|');
    if (parts.length !== 2) {
      throw new BadRequestException('Invalid cursor');
    }

    const [createdAtRaw, id] = parts;
    const createdAt = new Date(createdAtRaw);
    if (!id || Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { createdAt, id };
  }

  private summarizeReceipts(
    receipts: Array<{
      status: string;
      checkedAt: Date | null;
    }>,
  ) {
    if (receipts.length === 0) {
      return null;
    }

    let latestCheckedAt: Date | null = null;
    let pending = 0;
    let delivered = 0;
    let error = 0;
    for (const receipt of receipts) {
      if (receipt.status === 'PENDING') {
        pending += 1;
      } else if (receipt.status === 'DELIVERED') {
        delivered += 1;
      } else if (receipt.status === 'ERROR') {
        error += 1;
      }
      if (
        receipt.checkedAt &&
        (!latestCheckedAt || receipt.checkedAt > latestCheckedAt)
      ) {
        latestCheckedAt = receipt.checkedAt;
      }
    }

    return {
      total: receipts.length,
      pending,
      delivered,
      error,
      latestCheckedAt,
    };
  }

  private toProviderReceipt(receipt: {
    id: string;
    provider: string;
    platform: string;
    status: string;
    userId: string | null;
    pushDeviceId: string | null;
    deviceTokenMasked: string | null;
    providerTicketId: string | null;
    providerReceiptId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    details: unknown;
    checkedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): PushDeliveryReceiptDto {
    return {
      id: receipt.id,
      provider: receipt.provider as PushDeliveryReceiptDto['provider'],
      platform: receipt.platform as PushDeliveryReceiptDto['platform'],
      status: receipt.status as PushDeliveryReceiptDto['status'],
      userId: receipt.userId,
      pushDeviceId: receipt.pushDeviceId,
      deviceTokenMasked: receipt.deviceTokenMasked,
      providerTicketId: receipt.providerTicketId,
      providerReceiptId: receipt.providerReceiptId,
      errorCode: receipt.errorCode,
      errorMessage: receipt.errorMessage,
      details: (receipt.details as Record<string, unknown> | null) ?? null,
      checkedAt: receipt.checkedAt,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
    };
  }
}

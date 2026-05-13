import { Injectable } from '@nestjs/common';
import {
  PushDeliveryReceiptStatus,
  PushPlatform,
  PushProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type PushDeliveryReceiptCreateInput = {
  taskId: string;
  provider: PushProvider;
  platform?: PushPlatform;
  userId?: string | null;
  pushDeviceId?: string | null;
  deviceTokenMasked?: string | null;
  providerTicketId?: string | null;
  providerReceiptId?: string | null;
  status: PushDeliveryReceiptStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  details?: Record<string, unknown> | null;
  checkedAt?: Date | null;
};

@Injectable()
export class PushDeliveryReceiptsRepo {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(inputs: PushDeliveryReceiptCreateInput[]) {
    if (inputs.length === 0) {
      return { count: 0 };
    }

    return this.prisma.pushDeliveryReceipt.createMany({
      data: inputs.map((input) => ({
        taskId: input.taskId,
        provider: input.provider,
        platform: input.platform ?? PushPlatform.UNKNOWN,
        userId: input.userId ?? null,
        pushDeviceId: input.pushDeviceId ?? null,
        deviceTokenMasked: input.deviceTokenMasked ?? null,
        providerTicketId: input.providerTicketId ?? null,
        providerReceiptId: input.providerReceiptId ?? null,
        status: input.status,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        ...(input.details !== undefined
          ? { details: this.toNullableJsonValue(input.details) }
          : {}),
        checkedAt: input.checkedAt ?? null,
      })),
    });
  }

  async listByTaskId(taskId: string) {
    return this.prisma.pushDeliveryReceipt.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async summarizeByTaskIds(taskIds: string[]) {
    if (taskIds.length === 0) {
      return new Map<
        string,
        {
          total: number;
          pending: number;
          delivered: number;
          error: number;
          latestCheckedAt: Date | null;
        }
      >();
    }

    const rows = await this.prisma.pushDeliveryReceipt.findMany({
      where: { taskId: { in: taskIds } },
      orderBy: [{ checkedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const summary = new Map<
      string,
      {
        total: number;
        pending: number;
        delivered: number;
        error: number;
        latestCheckedAt: Date | null;
      }
    >();

    for (const row of rows) {
      const entry = summary.get(row.taskId) ?? {
        total: 0,
        pending: 0,
        delivered: 0,
        error: 0,
        latestCheckedAt: null,
      };
      entry.total += 1;
      if (row.status === PushDeliveryReceiptStatus.PENDING) {
        entry.pending += 1;
      } else if (row.status === PushDeliveryReceiptStatus.DELIVERED) {
        entry.delivered += 1;
      } else if (row.status === PushDeliveryReceiptStatus.ERROR) {
        entry.error += 1;
      }
      if (!entry.latestCheckedAt && row.checkedAt) {
        entry.latestCheckedAt = row.checkedAt;
      }
      summary.set(row.taskId, entry);
    }

    return summary;
  }

  async listPendingExpoReceipts(now: Date, lookupDelayMs: number, take = 1000) {
    const readyAt = new Date(now.getTime() - lookupDelayMs);
    return this.prisma.pushDeliveryReceipt.findMany({
      where: {
        provider: PushProvider.EXPO,
        status: PushDeliveryReceiptStatus.PENDING,
        providerTicketId: { not: null },
        createdAt: { lte: readyAt },
      },
      orderBy: [{ checkedAt: 'asc' }, { createdAt: 'asc' }],
      take,
    });
  }

  async markLookupAttempted(providerTicketIds: string[], checkedAt: Date) {
    if (providerTicketIds.length === 0) {
      return 0;
    }

    const result = await this.prisma.pushDeliveryReceipt.updateMany({
      where: { providerTicketId: { in: providerTicketIds } },
      data: { checkedAt },
    });
    return result.count;
  }

  async markDelivered(
    providerTicketId: string,
    input: {
      providerReceiptId?: string | null;
      details?: Record<string, unknown> | null;
      checkedAt: Date;
    },
  ) {
    return this.prisma.pushDeliveryReceipt.update({
      where: { providerTicketId },
      data: {
        providerReceiptId: input.providerReceiptId ?? providerTicketId,
        status: PushDeliveryReceiptStatus.DELIVERED,
        ...(input.details !== undefined
          ? { details: this.toNullableJsonValue(input.details) }
          : {}),
        errorCode: null,
        errorMessage: null,
        checkedAt: input.checkedAt,
      },
    });
  }

  async markErrored(
    providerTicketId: string,
    input: {
      providerReceiptId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      details?: Record<string, unknown> | null;
      checkedAt: Date;
    },
  ) {
    return this.prisma.pushDeliveryReceipt.update({
      where: { providerTicketId },
      data: {
        providerReceiptId: input.providerReceiptId ?? providerTicketId,
        status: PushDeliveryReceiptStatus.ERROR,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        ...(input.details !== undefined
          ? { details: this.toNullableJsonValue(input.details) }
          : {}),
        checkedAt: input.checkedAt,
      },
    });
  }

  private toNullableJsonValue(
    value: Record<string, unknown> | null,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }
}

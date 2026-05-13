import { Injectable } from '@nestjs/common';
import { DeliveryTaskKind, DeliveryTaskStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DbClient } from '../prisma/db-client';
import {
  DeliveryTaskCreateInput,
  DeliveryTaskPayload,
  DeliveryTaskRecord,
  toJsonValue,
} from './delivery-task.types';

type DeliveryTaskModelClient = {
  create(args: {
    data: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  count(args: { where?: Record<string, unknown> }): Promise<number>;
  deleteMany(args: {
    where?: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Array<Record<string, 'asc' | 'desc'>>;
    take?: number;
  }): Promise<Record<string, unknown>[]>;
  groupBy?(args: {
    by: string[];
    where?: Record<string, unknown>;
    _count: { _all: true };
  }): Promise<Record<string, unknown>[]>;
  findUnique(args: {
    where: { id: string };
  }): Promise<Record<string, unknown> | null>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
};

@Injectable()
export class DeliveryTasksRepo {
  private readonly fallbackStore = new Map<string, DeliveryTaskRecord>();

  constructor(private readonly prisma: PrismaService) {}

  async create<TKind extends DeliveryTaskKind>(
    input: DeliveryTaskCreateInput<TKind>,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord<TKind>> {
    const client = this.getClient(tx);
    if (!client) {
      const now = new Date();
      const task: DeliveryTaskRecord<TKind> = {
        id: randomUUID(),
        kind: input.kind,
        status: DeliveryTaskStatus.PENDING,
        queueName: input.queueName,
        jobName: input.jobName,
        orgId: input.orgId ?? null,
        userId: input.userId ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        payload: this.clonePayload(input.payload),
        attemptCount: 0,
        maxAttempts: input.maxAttempts ?? 5,
        queuedAt: now,
        lastAttemptAt: null,
        processingStartedAt: null,
        completedAt: null,
        lastError: null,
        retriedAt: null,
        replacedByTaskId: null,
        createdAt: now,
        updatedAt: now,
      };
      this.fallbackStore.set(task.id, task);
      return task;
    }

    const created = await client.create({
      data: {
        kind: input.kind,
        queueName: input.queueName,
        jobName: input.jobName,
        orgId: input.orgId ?? null,
        userId: input.userId ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        payload: toJsonValue(input.payload as Record<string, unknown>),
        maxAttempts: input.maxAttempts ?? 5,
      },
    });

    return this.mapRecord(created) as DeliveryTaskRecord<TKind>;
  }

  async findById<TKind extends DeliveryTaskKind = DeliveryTaskKind>(
    id: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord<TKind> | null> {
    const client = this.getClient(tx);
    if (!client) {
      return (this.fallbackStore.get(id) as DeliveryTaskRecord<TKind>) ?? null;
    }

    const task = await client.findUnique({ where: { id } });
    return task ? (this.mapRecord(task) as DeliveryTaskRecord<TKind>) : null;
  }

  async list(options: {
    kind?: DeliveryTaskKind;
    status?: DeliveryTaskStatus;
    orgId?: string;
    referenceType?: string;
    referenceId?: string;
    lastErrorContains?: string;
    take: number;
    cursor?: {
      createdAt: Date;
      id: string;
    };
  }): Promise<DeliveryTaskRecord[]> {
    const client = this.getClient();
    if (!client) {
      let rows = Array.from(this.fallbackStore.values());
      if (options.kind) {
        rows = rows.filter((row) => row.kind === options.kind);
      }
      if (options.status) {
        rows = rows.filter((row) => row.status === options.status);
      }
      if (options.orgId) {
        rows = rows.filter((row) => row.orgId === options.orgId);
      }
      if (options.referenceType) {
        rows = rows.filter(
          (row) => row.referenceType === options.referenceType,
        );
      }
      if (options.referenceId) {
        rows = rows.filter((row) => row.referenceId === options.referenceId);
      }
      if (options.lastErrorContains) {
        const needle = options.lastErrorContains.toLowerCase();
        rows = rows.filter((row) =>
          (row.lastError ?? '').toLowerCase().includes(needle),
        );
      }
      rows.sort((a, b) => {
        if (a.createdAt.getTime() !== b.createdAt.getTime()) {
          return b.createdAt.getTime() - a.createdAt.getTime();
        }
        return b.id.localeCompare(a.id);
      });
      if (options.cursor) {
        rows = rows.filter(
          (row) =>
            row.createdAt.getTime() < options.cursor!.createdAt.getTime() ||
            (row.createdAt.getTime() === options.cursor!.createdAt.getTime() &&
              row.id < options.cursor!.id),
        );
      }
      return rows.slice(0, options.take);
    }

    const where: Record<string, unknown> = {};
    if (options.kind) {
      where.kind = options.kind;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.orgId) {
      where.orgId = options.orgId;
    }
    if (options.referenceType) {
      where.referenceType = options.referenceType;
    }
    if (options.referenceId) {
      where.referenceId = options.referenceId;
    }
    if (options.lastErrorContains) {
      where.lastError = {
        contains: options.lastErrorContains,
        mode: 'insensitive',
      };
    }
    if (options.cursor) {
      where.OR = [
        { createdAt: { lt: options.cursor.createdAt } },
        { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
      ];
    }

    const rows = await client.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.take,
    });
    return rows.map((row) => this.mapRecord(row));
  }

  async summarize(options: {
    kind?: DeliveryTaskKind;
    status?: DeliveryTaskStatus;
    orgId?: string;
    referenceType?: string;
    referenceId?: string;
    lastErrorContains?: string;
  }) {
    const where = this.buildWhere(options);
    const client = this.getClient();

    if (!client) {
      let rows = Array.from(this.fallbackStore.values());
      rows = this.applyFilters(rows, options);
      const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {});
      const byKind = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.kind] = (acc[row.kind] ?? 0) + 1;
        return acc;
      }, {});
      const topErrors = Array.from(
        rows
          .reduce<
            Map<string, { kind: string; lastError: string; count: number }>
          >((acc, row) => {
            if (!row.lastError) {
              return acc;
            }
            const key = `${row.kind}|${row.lastError}`;
            const existing = acc.get(key);
            if (existing) {
              existing.count += 1;
            } else {
              acc.set(key, {
                kind: row.kind,
                lastError: row.lastError,
                count: 1,
              });
            }
            return acc;
          }, new Map())
          .values(),
      )
        .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
        .slice(0, 5);
      const failedRows = rows
        .filter((row) => row.status === DeliveryTaskStatus.FAILED)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      return {
        total: rows.length,
        byStatus,
        byKind,
        topErrors,
        failedCount: failedRows.length,
        oldestFailedAt: failedRows[0]?.createdAt ?? null,
        newestFailedAt:
          failedRows.length > 0
            ? failedRows[failedRows.length - 1].createdAt
            : null,
      };
    }

    const total = await client.count({ where });
    const byStatusGroups = client.groupBy
      ? await client.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        })
      : [];
    const byKindGroups = client.groupBy
      ? await client.groupBy({
          by: ['kind'],
          where,
          _count: { _all: true },
        })
      : [];
    const errorRows = await client.findMany({
      where: {
        ...where,
        lastError: { not: null },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    const failedOldest = await client.findMany({
      where: { ...where, status: DeliveryTaskStatus.FAILED },
      orderBy: [{ createdAt: 'asc' }],
      take: 1,
    });
    const failedNewest = await client.findMany({
      where: { ...where, status: DeliveryTaskStatus.FAILED },
      orderBy: [{ createdAt: 'desc' }],
      take: 1,
    });
    const failedCount = await client.count({
      where: { ...where, status: DeliveryTaskStatus.FAILED },
    });

    return {
      total,
      byStatus: byStatusGroups.reduce<Record<string, number>>((acc, row) => {
        acc[String(row.status)] = Number(
          (row._count as { _all?: number } | undefined)?._all ?? 0,
        );
        return acc;
      }, {}),
      byKind: byKindGroups.reduce<Record<string, number>>((acc, row) => {
        acc[String(row.kind)] = Number(
          (row._count as { _all?: number } | undefined)?._all ?? 0,
        );
        return acc;
      }, {}),
      topErrors: Array.from(
        errorRows
          .reduce<
            Map<string, { kind: string; lastError: string; count: number }>
          >((acc, row) => {
            const kind = String(row.kind);
            const lastError = String(row.lastError ?? '');
            if (!lastError) {
              return acc;
            }
            const key = `${kind}|${lastError}`;
            const existing = acc.get(key);
            if (existing) {
              existing.count += 1;
            } else {
              acc.set(key, { kind, lastError, count: 1 });
            }
            return acc;
          }, new Map())
          .values(),
      )
        .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
        .slice(0, 5),
      failedCount,
      oldestFailedAt: failedOldest[0]
        ? new Date(String(failedOldest[0].createdAt))
        : null,
      newestFailedAt: failedNewest[0]
        ? new Date(String(failedNewest[0].createdAt))
        : null,
    };
  }

  async cleanupTerminalOlderThan(options: {
    olderThan: Date;
    statuses?: DeliveryTaskStatus[];
    dryRun?: boolean;
  }) {
    const statuses = options.statuses ?? [
      DeliveryTaskStatus.SUCCEEDED,
      DeliveryTaskStatus.FAILED,
      DeliveryTaskStatus.RETRIED,
    ];
    const where = {
      status: { in: statuses },
      createdAt: { lt: options.olderThan },
    };
    const client = this.getClient();

    if (!client) {
      const ids = Array.from(this.fallbackStore.values())
        .filter(
          (row) =>
            statuses.includes(row.status) && row.createdAt < options.olderThan,
        )
        .map((row) => row.id);
      if (!options.dryRun) {
        ids.forEach((id) => this.fallbackStore.delete(id));
      }
      return { count: ids.length };
    }

    if (options.dryRun) {
      return { count: await client.count({ where }) };
    }

    return client.deleteMany({ where });
  }

  async markProcessing<TKind extends DeliveryTaskKind = DeliveryTaskKind>(
    id: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord<TKind> | null> {
    const existing = await this.findById<TKind>(id, tx);
    if (
      !existing ||
      existing.status === DeliveryTaskStatus.SUCCEEDED ||
      existing.status === DeliveryTaskStatus.RETRIED
    ) {
      return existing;
    }

    const now = new Date();
    return (await this.update(
      id,
      {
        status: DeliveryTaskStatus.PROCESSING,
        attemptCount: existing.attemptCount + 1,
        processingStartedAt: existing.processingStartedAt ?? now,
        lastAttemptAt: now,
        lastError: null,
      },
      tx,
    )) as DeliveryTaskRecord<TKind> | null;
  }

  async claimForRetry(
    id: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord | null> {
    const client = this.getClient(tx);
    if (!client) {
      const existing = this.fallbackStore.get(id);
      if (
        !existing ||
        existing.status !== DeliveryTaskStatus.FAILED ||
        existing.retriedAt ||
        existing.replacedByTaskId
      ) {
        return null;
      }

      const claimed: DeliveryTaskRecord = {
        ...existing,
        status: DeliveryTaskStatus.PROCESSING,
        updatedAt: new Date(),
      };
      this.fallbackStore.set(id, claimed);
      return claimed;
    }

    const result = await client.updateMany({
      where: {
        id,
        status: DeliveryTaskStatus.FAILED,
        retriedAt: null,
        replacedByTaskId: null,
      },
      data: {
        status: DeliveryTaskStatus.PROCESSING,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id, tx);
  }

  async releaseRetryClaim(
    id: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord | null> {
    return this.update(
      id,
      {
        status: DeliveryTaskStatus.FAILED,
      },
      tx,
    );
  }

  async markRetried(
    id: string,
    replacedByTaskId: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord | null> {
    return this.update(
      id,
      {
        status: DeliveryTaskStatus.RETRIED,
        retriedAt: new Date(),
        replacedByTaskId,
        completedAt: new Date(),
      },
      tx,
    );
  }

  async markRetryScheduled(
    id: string,
    error: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord | null> {
    return this.update(
      id,
      {
        status: DeliveryTaskStatus.PENDING,
        lastError: this.truncateError(error),
      },
      tx,
    );
  }

  async markFailed(
    id: string,
    error: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord | null> {
    return this.update(
      id,
      {
        status: DeliveryTaskStatus.FAILED,
        completedAt: new Date(),
        lastError: this.truncateError(error),
      },
      tx,
    );
  }

  async markSucceeded(
    id: string,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord | null> {
    return this.update(
      id,
      {
        status: DeliveryTaskStatus.SUCCEEDED,
        completedAt: new Date(),
        lastError: null,
      },
      tx,
    );
  }

  private async update(
    id: string,
    data: Partial<DeliveryTaskRecord>,
    tx?: DbClient,
  ): Promise<DeliveryTaskRecord | null> {
    const client = this.getClient(tx);
    if (!client) {
      const existing = this.fallbackStore.get(id);
      if (!existing) {
        return null;
      }
      const updated: DeliveryTaskRecord = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.fallbackStore.set(id, updated);
      return updated;
    }

    const updated = await client.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.attemptCount !== undefined
          ? { attemptCount: data.attemptCount }
          : {}),
        ...(data.lastAttemptAt !== undefined
          ? { lastAttemptAt: data.lastAttemptAt }
          : {}),
        ...(data.processingStartedAt !== undefined
          ? { processingStartedAt: data.processingStartedAt }
          : {}),
        ...(data.completedAt !== undefined
          ? { completedAt: data.completedAt }
          : {}),
        ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
        ...(data.retriedAt !== undefined ? { retriedAt: data.retriedAt } : {}),
        ...(data.replacedByTaskId !== undefined
          ? { replacedByTaskId: data.replacedByTaskId }
          : {}),
      },
    });

    return this.mapRecord(updated);
  }

  private getClient(tx?: DbClient): DeliveryTaskModelClient | null {
    const prisma = (tx ?? this.prisma) as unknown as {
      deliveryTask?: DeliveryTaskModelClient;
    };
    return prisma.deliveryTask ?? null;
  }

  private mapRecord(record: Record<string, unknown>): DeliveryTaskRecord {
    return {
      id: String(record.id),
      kind: record.kind as DeliveryTaskKind,
      status: record.status as DeliveryTaskStatus,
      queueName: String(record.queueName),
      jobName: String(record.jobName),
      orgId: (record.orgId as string | null | undefined) ?? null,
      userId: (record.userId as string | null | undefined) ?? null,
      referenceType:
        (record.referenceType as string | null | undefined) ?? null,
      referenceId: (record.referenceId as string | null | undefined) ?? null,
      payload: this.clonePayload(
        (record.payload as Prisma.JsonObject | null | undefined) ?? {},
      ) as DeliveryTaskPayload,
      attemptCount: Number(record.attemptCount ?? 0),
      maxAttempts: Number(record.maxAttempts ?? 5),
      queuedAt: new Date(String(record.queuedAt)),
      lastAttemptAt: record.lastAttemptAt
        ? new Date(String(record.lastAttemptAt))
        : null,
      processingStartedAt: record.processingStartedAt
        ? new Date(String(record.processingStartedAt))
        : null,
      completedAt: record.completedAt
        ? new Date(String(record.completedAt))
        : null,
      lastError: (record.lastError as string | null | undefined) ?? null,
      retriedAt: record.retriedAt ? new Date(String(record.retriedAt)) : null,
      replacedByTaskId:
        (record.replacedByTaskId as string | null | undefined) ?? null,
      createdAt: new Date(String(record.createdAt)),
      updatedAt: new Date(String(record.updatedAt)),
    };
  }

  private clonePayload<T>(payload: T): T {
    return JSON.parse(JSON.stringify(payload)) as T;
  }

  private buildWhere(options: {
    kind?: DeliveryTaskKind;
    status?: DeliveryTaskStatus;
    orgId?: string;
    referenceType?: string;
    referenceId?: string;
    lastErrorContains?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (options.kind) {
      where.kind = options.kind;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.orgId) {
      where.orgId = options.orgId;
    }
    if (options.referenceType) {
      where.referenceType = options.referenceType;
    }
    if (options.referenceId) {
      where.referenceId = options.referenceId;
    }
    if (options.lastErrorContains) {
      where.lastError = {
        contains: options.lastErrorContains,
        mode: 'insensitive',
      };
    }
    return where;
  }

  private applyFilters(
    rows: DeliveryTaskRecord[],
    options: {
      kind?: DeliveryTaskKind;
      status?: DeliveryTaskStatus;
      orgId?: string;
      referenceType?: string;
      referenceId?: string;
      lastErrorContains?: string;
    },
  ) {
    return rows.filter((row) => {
      if (options.kind && row.kind !== options.kind) {
        return false;
      }
      if (options.status && row.status !== options.status) {
        return false;
      }
      if (options.orgId && row.orgId !== options.orgId) {
        return false;
      }
      if (
        options.referenceType &&
        row.referenceType !== options.referenceType
      ) {
        return false;
      }
      if (options.referenceId && row.referenceId !== options.referenceId) {
        return false;
      }
      if (
        options.lastErrorContains &&
        !(row.lastError ?? '')
          .toLowerCase()
          .includes(options.lastErrorContains.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }

  private truncateError(error: string) {
    return error.slice(0, 2000);
  }
}

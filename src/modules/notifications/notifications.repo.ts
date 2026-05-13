import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';
import { NotificationTypeEnum } from './notifications.constants';

export type NotificationInput = {
  orgId: string;
  recipientUserId: string;
  type: NotificationType | NotificationTypeEnum;
  title: string;
  body?: string | null;
  data: Record<string, unknown>;
};

type CursorInfo = {
  id: string;
  createdAt: Date;
};

@Injectable()
export class NotificationsRepo {
  constructor(private readonly prisma: PrismaService) {}

  async createManyAndReturn(notifications: NotificationInput[], tx?: DbClient) {
    if (notifications.length === 0) {
      return [];
    }
    const prisma: DbClient = tx ?? this.prisma;
    const created = [];
    for (const notification of notifications) {
      created.push(
        await prisma.notification.create({
          data: {
            ...notification,
            body: notification.body ?? null,
            data: notification.data as Prisma.InputJsonValue,
            type: notification.type as NotificationType,
          },
        }),
      );
    }
    return created;
  }

  async createMany(notifications: NotificationInput[], tx?: DbClient) {
    if (notifications.length === 0) {
      return { count: 0 };
    }
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.notification.createMany({
      data: notifications.map((notification) => ({
        ...notification,
        body: notification.body ?? null,
        data: notification.data as Prisma.InputJsonValue,
        type: notification.type as NotificationType,
      })),
    });
  }

  findByIdForUser(notificationId: string, userId: string, orgId: string) {
    return this.prisma.notification.findFirst({
      where: { id: notificationId, recipientUserId: userId, orgId },
    });
  }

  findByIdForUserAcrossOrgs(
    notificationId: string,
    userId: string,
    orgIds: string[],
  ) {
    if (orgIds.length === 0) {
      return Promise.resolve(null);
    }

    return this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientUserId: userId,
        orgId: { in: orgIds },
      },
    });
  }

  async listForUser(
    userId: string,
    orgId: string,
    options: {
      unreadOnly?: boolean;
      includeDismissed?: boolean;
      type?: NotificationTypeEnum;
      take: number;
      cursor?: CursorInfo;
    },
  ) {
    const prisma = this.prisma;
    const where: Record<string, unknown> = {
      orgId,
      recipientUserId: userId,
    };
    if (options.unreadOnly) {
      where.readAt = null;
    }
    if (!options.includeDismissed) {
      where.dismissedAt = null;
    }
    if (options.type) {
      where.type = options.type;
    }
    if (options.cursor) {
      where.OR = [
        { createdAt: { lt: options.cursor.createdAt } },
        {
          createdAt: options.cursor.createdAt,
          id: { lt: options.cursor.id },
        },
      ];
    }

    const items = await prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.take,
    });

    return { items };
  }

  async listForUserAcrossOrgs(
    userId: string,
    orgIds: string[],
    options: {
      unreadOnly?: boolean;
      includeDismissed?: boolean;
      type?: NotificationTypeEnum;
      take: number;
      cursor?: CursorInfo;
    },
  ) {
    if (orgIds.length === 0) {
      return { items: [] };
    }

    const prisma = this.prisma;
    const where: Record<string, unknown> = {
      orgId: { in: orgIds },
      recipientUserId: userId,
    };
    if (options.unreadOnly) {
      where.readAt = null;
    }
    if (!options.includeDismissed) {
      where.dismissedAt = null;
    }
    if (options.type) {
      where.type = options.type;
    }
    if (options.cursor) {
      where.OR = [
        { createdAt: { lt: options.cursor.createdAt } },
        {
          createdAt: options.cursor.createdAt,
          id: { lt: options.cursor.id },
        },
      ];
    }

    const items = await prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.take,
    });

    return { items };
  }

  async markRead(
    notificationId: string,
    userId: string,
    orgId: string,
    readAt: Date,
  ) {
    const prisma = this.prisma;
    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientUserId: userId,
        orgId,
        readAt: null,
        dismissedAt: null,
      },
      data: { readAt },
    });
    return result.count as number;
  }

  async markAllRead(userId: string, orgId: string, readAt: Date) {
    const prisma = this.prisma;
    const result = await prisma.notification.updateMany({
      where: {
        recipientUserId: userId,
        orgId,
        readAt: null,
        dismissedAt: null,
      },
      data: { readAt },
    });
    return result.count as number;
  }

  async markAllReadAcrossOrgs(userId: string, orgIds: string[], readAt: Date) {
    if (orgIds.length === 0) {
      return 0;
    }

    const prisma = this.prisma;
    const result = await prisma.notification.updateMany({
      where: {
        recipientUserId: userId,
        orgId: { in: orgIds },
        readAt: null,
        dismissedAt: null,
      },
      data: { readAt },
    });
    return result.count as number;
  }

  async markDismissed(
    notificationId: string,
    userId: string,
    orgId: string,
    dismissedAt: Date,
  ) {
    const prisma = this.prisma;
    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientUserId: userId,
        orgId,
        dismissedAt: null,
      },
      data: { dismissedAt },
    });
    return result.count as number;
  }

  async clearDismissed(notificationId: string, userId: string, orgId: string) {
    const prisma = this.prisma;
    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientUserId: userId,
        orgId,
        dismissedAt: { not: null },
      },
      data: { dismissedAt: null },
    });
    return result.count as number;
  }

  async countUnread(userId: string, orgId: string) {
    return this.prisma.notification.count({
      where: {
        recipientUserId: userId,
        orgId,
        readAt: null,
        dismissedAt: null,
      },
    });
  }

  async countUnreadAcrossOrgs(userId: string, orgIds: string[]) {
    if (orgIds.length === 0) {
      return 0;
    }

    return this.prisma.notification.count({
      where: {
        recipientUserId: userId,
        orgId: { in: orgIds },
        readAt: null,
        dismissedAt: null,
      },
    });
  }
}

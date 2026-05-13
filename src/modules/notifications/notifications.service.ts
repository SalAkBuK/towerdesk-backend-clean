import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationTypeEnum } from './notifications.constants';
import { NotificationsRepo, NotificationInput } from './notifications.repo';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { toNotificationResponse } from './dto/notification.response.dto';
import { PushNotificationsService } from './push-notifications.service';
import { Notification } from '@prisma/client';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepo: NotificationsRepo,
    private readonly realtimeService: NotificationsRealtimeService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async listForUser(
    userId: string,
    orgId: string,
    options: {
      unreadOnly?: boolean;
      includeDismissed?: boolean;
      cursor?: string;
      type?: NotificationTypeEnum;
      limit?: number;
    },
  ) {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const cursorInfo = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;

    const { items } = await this.notificationsRepo.listForUser(userId, orgId, {
      unreadOnly: options.unreadOnly,
      includeDismissed: options.includeDismissed,
      type: options.type,
      take: limit + 1,
      cursor: cursorInfo,
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  async listForUserAcrossOrgs(
    userId: string,
    orgIds: string[],
    options: {
      unreadOnly?: boolean;
      includeDismissed?: boolean;
      cursor?: string;
      type?: NotificationTypeEnum;
      limit?: number;
    },
  ) {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const cursorInfo = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;

    const { items } = await this.notificationsRepo.listForUserAcrossOrgs(
      userId,
      orgIds,
      {
        unreadOnly: options.unreadOnly,
        includeDismissed: options.includeDismissed,
        type: options.type,
        take: limit + 1,
        cursor: cursorInfo,
      },
    );

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  async createForUsers(input: {
    orgId: string;
    userIds: string[];
    type: NotificationTypeEnum;
    title: string;
    body?: string;
    data: Record<string, unknown>;
  }) {
    const uniqueUserIds = Array.from(new Set(input.userIds)).filter(Boolean);
    if (uniqueUserIds.length === 0) {
      return [];
    }

    const notifications: NotificationInput[] = uniqueUserIds.map((userId) => ({
      orgId: input.orgId,
      recipientUserId: userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: input.data,
    }));

    const created =
      await this.notificationsRepo.createManyAndReturn(notifications);

    this.publishCreatedNotifications(input.orgId, created);
    await this.queuePushForNotificationBatch({
      orgId: input.orgId,
      userIds: uniqueUserIds,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
    });

    return created.map(toNotificationResponse);
  }

  async markRead(notificationId: string, userId: string, orgId: string) {
    const existing = await this.notificationsRepo.findByIdForUser(
      notificationId,
      userId,
      orgId,
    );
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (!existing.readAt && !existing.dismissedAt) {
      const readAt = new Date();
      await this.notificationsRepo.markRead(
        notificationId,
        userId,
        orgId,
        readAt,
      );
      this.realtimeService.publishToUser(orgId, userId, 'notifications:read', {
        id: notificationId,
        readAt,
      });
    }
  }

  async markAllRead(userId: string, orgId: string) {
    const readAt = new Date();
    const updated = await this.notificationsRepo.markAllRead(
      userId,
      orgId,
      readAt,
    );
    if (updated > 0) {
      this.realtimeService.publishToUser(
        orgId,
        userId,
        'notifications:read_all',
        {
          readAt,
        },
      );
    }
  }

  async dismiss(notificationId: string, userId: string, orgId: string) {
    const existing = await this.notificationsRepo.findByIdForUser(
      notificationId,
      userId,
      orgId,
    );
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (!existing.dismissedAt) {
      const dismissedAt = new Date();
      await this.notificationsRepo.markDismissed(
        notificationId,
        userId,
        orgId,
        dismissedAt,
      );
      this.realtimeService.publishToUser(
        orgId,
        userId,
        'notifications:dismiss',
        { id: notificationId, dismissedAt },
      );
    }
  }

  async undismiss(notificationId: string, userId: string, orgId: string) {
    const existing = await this.notificationsRepo.findByIdForUser(
      notificationId,
      userId,
      orgId,
    );
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.dismissedAt) {
      await this.notificationsRepo.clearDismissed(
        notificationId,
        userId,
        orgId,
      );
      this.realtimeService.publishToUser(
        orgId,
        userId,
        'notifications:undismiss',
        { id: notificationId },
      );
    }
  }

  async countUnread(userId: string, orgId: string) {
    return this.notificationsRepo.countUnread(userId, orgId);
  }

  async countUnreadAcrossOrgs(userId: string, orgIds: string[]) {
    return this.notificationsRepo.countUnreadAcrossOrgs(userId, orgIds);
  }

  async markReadAcrossOrgs(
    notificationId: string,
    userId: string,
    orgIds: string[],
  ) {
    const existing = await this.notificationsRepo.findByIdForUserAcrossOrgs(
      notificationId,
      userId,
      orgIds,
    );
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    await this.markRead(notificationId, userId, existing.orgId);
  }

  async markAllReadAcrossOrgs(userId: string, orgIds: string[]) {
    const readAt = new Date();
    const updated = await this.notificationsRepo.markAllReadAcrossOrgs(
      userId,
      orgIds,
      readAt,
    );
    if (updated > 0) {
      for (const orgId of orgIds) {
        this.realtimeService.publishToUser(
          orgId,
          userId,
          'notifications:read_all',
          {
            readAt,
          },
        );
      }
    }
  }

  async dismissAcrossOrgs(
    notificationId: string,
    userId: string,
    orgIds: string[],
  ) {
    const existing = await this.notificationsRepo.findByIdForUserAcrossOrgs(
      notificationId,
      userId,
      orgIds,
    );
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    await this.dismiss(notificationId, userId, existing.orgId);
  }

  async undismissAcrossOrgs(
    notificationId: string,
    userId: string,
    orgIds: string[],
  ) {
    const existing = await this.notificationsRepo.findByIdForUserAcrossOrgs(
      notificationId,
      userId,
      orgIds,
    );
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    await this.undismiss(notificationId, userId, existing.orgId);
  }

  private encodeCursor(notification: { id: string; createdAt: Date }) {
    const value = `${notification.createdAt.toISOString()}|${notification.id}`;
    return Buffer.from(value, 'utf8').toString('base64');
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
    if (!createdAtRaw || !id) {
      throw new BadRequestException('Invalid cursor');
    }

    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { createdAt, id };
  }

  publishCreatedNotifications(orgId: string, created: Notification[]) {
    const payloads = created.map(toNotificationResponse);
    created.forEach((notification, index) => {
      this.logger.debug({
        event: 'notifications:new',
        recipientUserId: notification.recipientUserId,
        type: notification.type,
        requestId: (notification.data as Record<string, unknown>)?.requestId,
      });
      this.realtimeService.publishToUser(
        orgId,
        notification.recipientUserId,
        'notifications:new',
        payloads[index],
      );
    });
  }

  async queuePushForNotificationBatch(input: {
    orgId: string;
    userIds: string[];
    type: NotificationTypeEnum;
    title: string;
    body?: string;
    data: Record<string, unknown>;
  }) {
    await this.pushNotificationsService.sendToUsers({
      orgId: input.orgId,
      userIds: input.userIds,
      title: input.title,
      body: input.body,
      data: {
        kind: 'notification',
        notificationType: input.type,
        ...input.data,
      },
    });
  }
}

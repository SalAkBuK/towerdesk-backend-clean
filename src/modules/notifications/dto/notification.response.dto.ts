import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationTypeEnum } from '../notifications.constants';

export class NotificationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty({ enum: NotificationTypeEnum })
  type!: NotificationTypeEnum;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  body?: string | null;

  @ApiProperty()
  data!: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  readAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  dismissedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export const toNotificationResponse = (notification: {
  id: string;
  orgId: string;
  type: NotificationType | NotificationTypeEnum;
  title: string;
  body?: string | null;
  data: Prisma.JsonValue;
  readAt?: Date | null;
  dismissedAt?: Date | null;
  createdAt: Date;
}): NotificationResponseDto => ({
  id: notification.id,
  orgId: notification.orgId,
  type: notification.type as NotificationTypeEnum,
  title: notification.title,
  body: notification.body ?? null,
  data: notification.data as Record<string, unknown>,
  readAt: notification.readAt ?? null,
  dismissedAt: notification.dismissedAt ?? null,
  createdAt: notification.createdAt,
});

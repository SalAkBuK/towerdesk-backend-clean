import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { NotificationsListResponseDto } from './dto/notifications-list.response.dto';
import { toNotificationResponse } from './dto/notification.response.dto';
import { NotificationActionResponseDto } from './dto/notification-action.response.dto';
import { NotificationsUnreadCountResponseDto } from './dto/notifications-unread-count.response.dto';
import { PushNotificationsService } from './push-notifications.service';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import {
  PushDeviceResponseDto,
  toPushDeviceResponse,
} from './dto/push-device.response.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Get()
  @RequirePermissions('notifications.read')
  @ApiOkResponse({ type: NotificationsListResponseDto })
  async list(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const { items, nextCursor } = await this.notificationsService.listForUser(
      userId,
      orgId,
      {
        unreadOnly: query.unreadOnly,
        includeDismissed: query.includeDismissed,
        cursor: query.cursor,
        type: query.type,
        limit: query.limit,
      },
    );

    return {
      items: items.map(toNotificationResponse),
      nextCursor,
    };
  }

  @Get('unread-count')
  @RequirePermissions('notifications.read')
  @ApiOkResponse({ type: NotificationsUnreadCountResponseDto })
  async unreadCount(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
  ) {
    const unreadCount = await this.notificationsService.countUnread(
      userId,
      orgId,
    );
    return { unreadCount };
  }

  @Post(':id/read')
  @RequirePermissions('notifications.write')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async markRead(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
    @Param('id') notificationId: string,
  ) {
    await this.notificationsService.markRead(notificationId, userId, orgId);
    return { success: true };
  }

  @Post('read-all')
  @RequirePermissions('notifications.write')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async markAllRead(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
  ) {
    await this.notificationsService.markAllRead(userId, orgId);
    return { success: true };
  }

  @Post('push-devices/register')
  @RequirePermissions('notifications.write')
  @ApiOkResponse({ type: PushDeviceResponseDto })
  async registerPushDevice(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    const device = await this.pushNotificationsService.registerDevice(
      userId,
      orgId,
      dto,
    );
    return toPushDeviceResponse(device);
  }

  @Post('push-devices/unregister')
  @RequirePermissions('notifications.write')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async unregisterPushDevice(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UnregisterPushDeviceDto,
  ) {
    await this.pushNotificationsService.unregisterDevice(
      userId,
      orgId,
      dto.token,
    );
    return { success: true };
  }

  @Post(':id/dismiss')
  @RequirePermissions('notifications.write')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async dismiss(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
    @Param('id') notificationId: string,
  ) {
    await this.notificationsService.dismiss(notificationId, userId, orgId);
    return { success: true };
  }

  @Post(':id/undismiss')
  @RequirePermissions('notifications.write')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async undismiss(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
    @Param('id') notificationId: string,
  ) {
    await this.notificationsService.undismiss(notificationId, userId, orgId);
    return { success: true };
  }
}

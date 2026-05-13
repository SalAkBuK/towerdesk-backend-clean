import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnerPortfolioGuard } from '../../common/guards/owner-portfolio.guard';
import { OwnerPortfolioScopeService } from '../owner-portfolio/owner-portfolio-scope.service';
import {
  PushDeviceResponseDto,
  toPushDeviceResponse,
} from './dto/push-device.response.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UpdatePushDeviceDto } from './dto/update-push-device.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { NotificationActionResponseDto } from './dto/notification-action.response.dto';
import { NotificationsListResponseDto } from './dto/notifications-list.response.dto';
import { toNotificationResponse } from './dto/notification.response.dto';
import { NotificationsUnreadCountResponseDto } from './dto/notifications-unread-count.response.dto';
import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';

@ApiTags('owner-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnerPortfolioGuard)
@Controller('owner/notifications')
export class OwnerNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly ownerPortfolioScopeService: OwnerPortfolioScopeService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: NotificationsListResponseDto })
  async list(
    @CurrentUser('sub') userId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const orgIds =
      await this.ownerPortfolioScopeService.listAccessibleOrgIds(userId);
    const { items, nextCursor } =
      await this.notificationsService.listForUserAcrossOrgs(userId, orgIds, {
        unreadOnly: query.unreadOnly,
        includeDismissed: query.includeDismissed,
        cursor: query.cursor,
        type: query.type,
        limit: query.limit,
      });

    return {
      items: items.map(toNotificationResponse),
      nextCursor,
    };
  }

  @Get('unread-count')
  @ApiOkResponse({ type: NotificationsUnreadCountResponseDto })
  async unreadCount(@CurrentUser('sub') userId: string) {
    const orgIds =
      await this.ownerPortfolioScopeService.listAccessibleOrgIds(userId);
    const unreadCount = await this.notificationsService.countUnreadAcrossOrgs(
      userId,
      orgIds,
    );

    return { unreadCount };
  }

  @Post(':id/read')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async markRead(
    @CurrentUser('sub') userId: string,
    @Param('id') notificationId: string,
  ) {
    const orgIds =
      await this.ownerPortfolioScopeService.listAccessibleOrgIds(userId);
    await this.notificationsService.markReadAcrossOrgs(
      notificationId,
      userId,
      orgIds,
    );
    return { success: true };
  }

  @Post('read-all')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async markAllRead(@CurrentUser('sub') userId: string) {
    const orgIds =
      await this.ownerPortfolioScopeService.listAccessibleOrgIds(userId);
    await this.notificationsService.markAllReadAcrossOrgs(userId, orgIds);
    return { success: true };
  }

  @Post('devices')
  @ApiOkResponse({ type: PushDeviceResponseDto })
  async registerPushDevice(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    const device = await this.pushNotificationsService.registerOwnerDevice(
      userId,
      dto,
    );
    return toPushDeviceResponse(device);
  }

  @Patch('devices/:deviceId')
  @ApiOkResponse({ type: PushDeviceResponseDto })
  async updatePushDevice(
    @CurrentUser('sub') userId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdatePushDeviceDto,
  ) {
    const device = await this.pushNotificationsService.updateDevice(
      userId,
      deviceId,
      dto,
    );
    return toPushDeviceResponse(device);
  }

  @Delete('devices/:deviceId')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async removePushDevice(
    @CurrentUser('sub') userId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.pushNotificationsService.removeDevice(userId, deviceId);
    return { success: true };
  }

  @Post(':id/dismiss')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async dismiss(
    @CurrentUser('sub') userId: string,
    @Param('id') notificationId: string,
  ) {
    const orgIds =
      await this.ownerPortfolioScopeService.listAccessibleOrgIds(userId);
    await this.notificationsService.dismissAcrossOrgs(
      notificationId,
      userId,
      orgIds,
    );
    return { success: true };
  }

  @Post(':id/undismiss')
  @ApiOkResponse({ type: NotificationActionResponseDto })
  async undismiss(
    @CurrentUser('sub') userId: string,
    @Param('id') notificationId: string,
  ) {
    const orgIds =
      await this.ownerPortfolioScopeService.listAccessibleOrgIds(userId);
    await this.notificationsService.undismissAcrossOrgs(
      notificationId,
      userId,
      orgIds,
    );
    return { success: true };
  }
}

import {
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { env } from '../../config/env';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { NotificationTypeEnum } from './notifications.constants';
import { NotificationsService } from './notifications.service';
import { DevCreateNotificationDto } from './dto/dev-create-notification.dto';
import { NotificationResponseDto } from './dto/notification.response.dto';

@ApiTags('dev-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard)
@Controller('dev/notifications')
export class DevNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('create')
  @ApiOkResponse({ type: [NotificationResponseDto] })
  async create(
    @CurrentUser('sub') userId: string,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: DevCreateNotificationDto,
  ) {
    if (env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }

    const title = dto.title?.trim() || 'Dev notification';
    const body = dto.body?.trim();
    const data = dto.data ?? { source: 'dev' };
    const type = dto.type ?? NotificationTypeEnum.REQUEST_CREATED;

    return this.notificationsService.createForUsers({
      orgId,
      userIds: [userId],
      type,
      title,
      body,
      data,
    });
  }
}

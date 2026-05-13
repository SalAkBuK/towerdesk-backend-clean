import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CleanupDeliveryTasksDto,
  CleanupDeliveryTasksResponseDto,
  DeliveryTaskOpsSummaryResponseDto,
  RetryFailedDeliveryTasksDto,
  RetryFailedDeliveryTasksResponseDto,
} from './dto/delivery-task-ops.dto';
import {
  DeliveryTaskListResponseDto,
  DeliveryTaskResponseDto,
  RetryDeliveryTaskResponseDto,
} from './dto/delivery-task.response.dto';
import { ListDeliveryTasksQueryDto } from './dto/list-delivery-tasks.query.dto';
import { PlatformDeliveryTasksService } from './platform-delivery-tasks.service';

@ApiTags('platform')
@UseGuards(PlatformAuthGuard)
@Controller('platform/delivery-tasks')
export class PlatformDeliveryTasksController {
  constructor(
    private readonly platformDeliveryTasksService: PlatformDeliveryTasksService,
  ) {}

  @Get()
  @RequirePermissions('platform.delivery_tasks.read')
  @ApiOkResponse({ type: DeliveryTaskListResponseDto })
  list(@Query() query: ListDeliveryTasksQueryDto) {
    return this.platformDeliveryTasksService.list(query);
  }

  @Get('summary')
  @RequirePermissions('platform.delivery_tasks.read')
  @ApiOkResponse({ type: DeliveryTaskOpsSummaryResponseDto })
  summary(@Query() query: ListDeliveryTasksQueryDto) {
    return this.platformDeliveryTasksService.summary(query);
  }

  @Post('retry-failed')
  @RequirePermissions('platform.delivery_tasks.retry')
  @ApiOkResponse({ type: RetryFailedDeliveryTasksResponseDto })
  retryFailed(@Body() dto: RetryFailedDeliveryTasksDto) {
    return this.platformDeliveryTasksService.retryFailed(dto);
  }

  @Post('cleanup')
  @RequirePermissions('platform.delivery_tasks.cleanup')
  @ApiOkResponse({ type: CleanupDeliveryTasksResponseDto })
  cleanup(@Body() dto: CleanupDeliveryTasksDto) {
    return this.platformDeliveryTasksService.cleanup(dto);
  }

  @Get(':taskId')
  @RequirePermissions('platform.delivery_tasks.read')
  @ApiOkResponse({ type: DeliveryTaskResponseDto })
  getById(@Param('taskId') taskId: string) {
    return this.platformDeliveryTasksService.getById(taskId);
  }

  @Post(':taskId/retry')
  @RequirePermissions('platform.delivery_tasks.retry')
  @ApiOkResponse({ type: RetryDeliveryTaskResponseDto })
  retry(@Param('taskId') taskId: string) {
    return this.platformDeliveryTasksService.retry(taskId);
  }
}

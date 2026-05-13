import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowAnyScopePermissions } from '../../common/decorators/allow-any-scope-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import {
  BroadcastResponseDto,
  toBroadcastResponse,
} from './dto/broadcast.response.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts.query.dto';

@ApiTags('broadcasts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard)
@Controller('org/broadcasts')
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('broadcasts.write')
  @ApiCreatedResponse({ type: BroadcastResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: CreateBroadcastDto,
  ): Promise<BroadcastResponseDto> {
    const broadcast = await this.broadcastsService.createBroadcast(
      user,
      orgId,
      dto,
    );
    return toBroadcastResponse(broadcast);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('broadcasts.read')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/BroadcastResponseDto' },
        },
        nextCursor: { type: 'string', nullable: true },
      },
    },
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Query() query: ListBroadcastsQueryDto,
  ) {
    const { items, nextCursor } = await this.broadcastsService.listBroadcasts(
      user,
      orgId,
      {
        buildingId: query.buildingId,
        cursor: query.cursor,
        limit: query.limit,
      },
    );
    return {
      items: items.map(toBroadcastResponse),
      nextCursor,
    };
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('broadcasts.read')
  @ApiOkResponse({ type: BroadcastResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Param('id') broadcastId: string,
  ): Promise<BroadcastResponseDto> {
    const broadcast = await this.broadcastsService.getBroadcast(
      user,
      orgId,
      broadcastId,
    );
    return toBroadcastResponse(broadcast);
  }
}

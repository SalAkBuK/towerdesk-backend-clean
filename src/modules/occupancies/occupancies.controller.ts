import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  BuildingReadAccess,
  BuildingWriteAccess,
} from '../../common/decorators/building-access.decorator';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateOccupancyDto } from './dto/create-occupancy.dto';
import { ListOccupanciesQueryDto } from './dto/list-occupancies.query.dto';
import {
  OccupancyResponseDto,
  toOccupancyResponse,
} from './dto/occupancy.response.dto';
import { OccupanciesService } from './occupancies.service';

@ApiTags('occupancies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId/occupancies')
export class OccupanciesController {
  constructor(private readonly occupanciesService: OccupanciesService) {}

  @Post()
  @BuildingWriteAccess()
  @RequirePermissions('occupancy.write')
  @ApiOkResponse({ type: OccupancyResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateOccupancyDto,
  ) {
    const occupancy = await this.occupanciesService.create(
      user,
      buildingId,
      dto,
    );
    return toOccupancyResponse(occupancy);
  }

  @Get()
  @BuildingReadAccess()
  @RequirePermissions('occupancy.read')
  @ApiOkResponse({ type: [OccupancyResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListOccupanciesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, nextCursor } = await this.occupanciesService.list(
      user,
      buildingId,
      query,
    );
    if (nextCursor) {
      res.setHeader('x-next-cursor', nextCursor);
    }
    return items.map(toOccupancyResponse);
  }

  @Get('count')
  @BuildingReadAccess()
  @RequirePermissions('occupancy.read')
  @ApiOkResponse({
    schema: {
      example: { active: 12 },
    },
  })
  async count(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    const active = await this.occupanciesService.countActive(user, buildingId);
    return { active };
  }
}

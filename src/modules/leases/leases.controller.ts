import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { BuildingReadAccess } from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { LeaseResponseDto, toLeaseResponse } from './dto/lease.dto';
import { LeaseHistoryDto, toLeaseHistoryDto } from './dto/lease-history.dto';
import { ListLeaseTimelineQueryDto } from './dto/list-lease-timeline.query.dto';
import { ListOrgLeasesQueryDto } from './dto/list-org-leases.query.dto';
import { ListResidentLeaseTimelineQueryDto } from './dto/list-resident-lease-timeline.query.dto';
import { ListResidentLeasesQueryDto } from './dto/list-resident-leases.query.dto';
import { LeaseTimelineResponseDto } from './dto/lease-timeline.response.dto';
import { OrgLeasesResponseDto } from './dto/org-leases.response.dto';
import {
  ResidentLeaseTimelineResponseDto,
  toResidentLeaseTimelineItemDto,
} from './dto/resident-lease-timeline.response.dto';
import { ResidentLeasesResponseDto } from './dto/resident-leases.response.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeasesService } from './leases.service';

@ApiTags('leases')
@ApiBearerAuth()
@Controller('org')
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Get('leases')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
  @RequirePermissions('leases.read')
  @ApiOkResponse({ type: OrgLeasesResponseDto })
  async listOrgLeases(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrgLeasesQueryDto,
  ) {
    const result = await this.leasesService.listOrgLeases(user, query);
    return {
      items: result.items.map(toLeaseResponse),
      nextCursor: result.nextCursor,
    };
  }

  @Get('buildings/:buildingId/units/:unitId/lease/active')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard, BuildingAccessGuard)
  @BuildingReadAccess()
  @RequirePermissions('leases.read')
  @ApiOkResponse({ type: LeaseResponseDto })
  async getActiveLeaseForUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('unitId') unitId: string,
  ) {
    const lease = await this.leasesService.getActiveLeaseForUnit(
      user,
      buildingId,
      unitId,
    );
    return lease ? toLeaseResponse(lease) : null;
  }

  @Get('leases/:leaseId')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
  @RequirePermissions('leases.read')
  @ApiOkResponse({ type: LeaseResponseDto })
  async getLeaseById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ) {
    const lease = await this.leasesService.getLeaseById(user, leaseId);
    return toLeaseResponse(lease);
  }

  @Get('residents/:userId/leases')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
  @RequirePermissions('leases.read')
  @ApiOkResponse({ type: ResidentLeasesResponseDto })
  async listResidentLeases(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Query() query: ListResidentLeasesQueryDto,
  ) {
    const result = await this.leasesService.listResidentLeases(
      user,
      userId,
      query,
    );
    return {
      items: result.items.map(toLeaseResponse),
      nextCursor: result.nextCursor,
    };
  }

  @Get('residents/:userId/leases/timeline')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
  @RequirePermissions('leases.read')
  @ApiOkResponse({ type: ResidentLeaseTimelineResponseDto })
  async listResidentLeaseTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Query() query: ListResidentLeaseTimelineQueryDto,
  ) {
    const result = await this.leasesService.listResidentLeaseTimeline(
      user,
      userId,
      query,
    );
    return {
      items: result.items.map(toResidentLeaseTimelineItemDto),
      nextCursor: result.nextCursor,
    };
  }

  @Get('leases/:leaseId/history')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
  @RequirePermissions('leases.read')
  @ApiOkResponse({ type: [LeaseHistoryDto] })
  async getLeaseHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ) {
    const history = await this.leasesService.getLeaseHistory(user, leaseId);
    return history.map(toLeaseHistoryDto);
  }

  @Get('leases/:leaseId/timeline')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
  @RequirePermissions('leases.read')
  @ApiOkResponse({ type: LeaseTimelineResponseDto })
  async getLeaseTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Query() query: ListLeaseTimelineQueryDto,
  ) {
    return this.leasesService.getLeaseTimeline(user, leaseId, query);
  }

  @Patch('leases/:leaseId')
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
  @RequirePermissions('leases.write')
  @ApiOkResponse({ type: LeaseResponseDto })
  async updateLease(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: UpdateLeaseDto,
  ) {
    const lease = await this.leasesService.updateLease(user, leaseId, dto);
    return toLeaseResponse(lease);
  }
}

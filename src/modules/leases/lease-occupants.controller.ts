import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ReplaceLeaseOccupantsDto } from './dto/replace-lease-occupants.dto';
import { LeaseOccupantDto, toLeaseOccupantDto } from './dto/lease-occupant.dto';
import { LeaseOccupantsService } from './lease-occupants.service';

@ApiTags('lease-occupants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/leases/:leaseId/occupants')
export class LeaseOccupantsController {
  constructor(private readonly leaseOccupantsService: LeaseOccupantsService) {}

  @Get()
  @RequirePermissions('leases.occupants.read')
  @ApiOkResponse({ type: [LeaseOccupantDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ) {
    const occupants = await this.leaseOccupantsService.list(user, leaseId);
    return occupants.map(toLeaseOccupantDto);
  }

  @Put()
  @RequirePermissions('leases.occupants.write')
  @ApiOkResponse({ type: [LeaseOccupantDto] })
  async replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: ReplaceLeaseOccupantsDto,
  ) {
    const occupants = await this.leaseOccupantsService.replace(
      user,
      leaseId,
      dto,
    );
    return occupants.map(toLeaseOccupantDto);
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { BuildingWriteAccess } from '../../common/decorators/building-access.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { MoveInDto } from './dto/move-in.dto';
import { MoveOutDto } from './dto/move-out.dto';
import { LeaseLifecycleService } from './lease-lifecycle.service';
import { LeaseResponseDto, toLeaseResponse } from './dto/lease.dto';

@ApiTags('leases-lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId')
export class LeaseLifecycleController {
  constructor(private readonly leaseLifecycleService: LeaseLifecycleService) {}

  @Post('leases/move-in')
  @HttpCode(HttpStatus.OK) // ✅ add this
  @RequirePermissions('leases.move_in')
  @BuildingWriteAccess()
  @ApiOkResponse({ type: LeaseResponseDto })
  async moveIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: MoveInDto,
  ) {
    const lease = await this.leaseLifecycleService.moveIn(
      user,
      buildingId,
      dto,
    );
    return toLeaseResponse(lease);
  }

  @Post('leases/:leaseId/move-out')
  @HttpCode(HttpStatus.OK) // ✅ add this
  @RequirePermissions('leases.move_out')
  @BuildingWriteAccess()
  @ApiOkResponse({ type: LeaseResponseDto })
  async moveOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('leaseId') leaseId: string,
    @Body() dto: MoveOutDto,
  ) {
    const lease = await this.leaseLifecycleService.moveOut(
      user,
      buildingId,
      leaseId,
      dto,
    );
    return toLeaseResponse(lease);
  }
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import {
  BuildingReadAccess,
  BuildingWriteAccess,
} from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ResidentsService } from './residents.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { ListBuildingResidentsQueryDto } from './dto/list-building-residents.query.dto';
import {
  ResidentOnboardingResponseDto,
  toResidentOnboardingResponse,
} from './dto/resident-onboarding.response.dto';
import { ResidentListItemDto } from './dto/resident-list.response.dto';

@ApiTags('building-residents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId/residents')
export class ResidentsController {
  constructor(private readonly residentsService: ResidentsService) {}

  @Post()
  @BuildingWriteAccess(true)
  @RequirePermissions('residents.write')
  @ApiOkResponse({ type: ResidentOnboardingResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateResidentDto,
  ) {
    const resident = await this.residentsService.onboard(user, buildingId, dto);
    return toResidentOnboardingResponse(resident);
  }

  @Get()
  @BuildingReadAccess()
  @RequirePermissions('residents.read')
  @ApiOkResponse({ type: [ResidentListItemDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListBuildingResidentsQueryDto,
  ) {
    return this.residentsService.list(
      user,
      buildingId,
      query.status,
      query.includeUnassigned === 'true',
    );
  }
}

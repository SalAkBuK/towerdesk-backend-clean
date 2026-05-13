import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BuildingReadAccess } from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import {
  ResidentDirectoryQueryDto,
  ResidentDirectoryResponseDto,
} from './dto/resident-directory.dto';
import { ResidentsService } from './residents.service';

@ApiTags('resident-directory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId')
export class ResidentDirectoryController {
  constructor(private readonly residentsService: ResidentsService) {}

  @Get('resident-directory')
  @BuildingReadAccess()
  @RequirePermissions('residents.read')
  @ApiOkResponse({ type: ResidentDirectoryResponseDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ResidentDirectoryQueryDto,
  ): Promise<ResidentDirectoryResponseDto> {
    return this.residentsService.listResidentDirectory(user, buildingId, query);
  }
}

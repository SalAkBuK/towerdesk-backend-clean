import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BuildingReadAccess } from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { BuildingAssignmentsService } from './building-assignments.service';
import { BuildingAssignmentResponseDto } from './dto/building-assignment.response.dto';

@ApiTags('building-assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId/assignments')
export class BuildingAssignmentsController {
  constructor(
    private readonly buildingAssignmentsService: BuildingAssignmentsService,
  ) {}

  @Get()
  @BuildingReadAccess()
  @RequirePermissions('building.assignments.read')
  @ApiOkResponse({ type: [BuildingAssignmentResponseDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    return this.buildingAssignmentsService.listAssignments(
      user.orgId as string,
      buildingId,
    );
  }
}

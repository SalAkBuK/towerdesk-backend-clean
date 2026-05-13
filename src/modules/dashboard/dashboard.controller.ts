import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { DashboardActivityQueryDto } from './dto/dashboard-activity.query.dto';
import { DashboardActivityResponseDto } from './dto/dashboard-activity.response.dto';
import { DashboardOverviewResponseDto } from './dto/dashboard-overview.response.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @RequirePermissions('dashboard.read')
  @ApiOkResponse({ type: DashboardOverviewResponseDto })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOverview(user);
  }

  @Get('activity')
  @RequirePermissions('dashboard.read')
  @ApiOkResponse({ type: DashboardActivityResponseDto })
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardActivityQueryDto,
  ) {
    return this.dashboardService.getActivity(user, query.limit);
  }
}

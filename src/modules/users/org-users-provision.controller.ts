import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { ProvisionUserResponseDto } from './dto/provision-user.response.dto';
import { OrgUsersProvisionService } from './org-users-provision.service';

@ApiTags('org-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/users')
export class OrgUsersProvisionController {
  constructor(
    private readonly orgUsersProvisionService: OrgUsersProvisionService,
  ) {}

  @Post('provision')
  @RequirePermissions('users.write')
  @ApiOkResponse({ type: ProvisionUserResponseDto })
  provision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProvisionUserDto,
  ) {
    return this.orgUsersProvisionService.provision(user, dto);
  }
}

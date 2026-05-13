import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgProfileService } from './org-profile.service';
import {
  OrgProfileResponseDto,
  toOrgProfileResponse,
} from './dto/org-profile.response.dto';
import { UpdateOrgProfileDto } from './dto/update-org-profile.dto';

@ApiTags('org-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard)
@Controller('org/profile')
export class OrgProfileController {
  constructor(private readonly orgProfileService: OrgProfileService) {}

  @Get()
  @ApiOkResponse({ type: OrgProfileResponseDto })
  async getProfile(@CurrentUser('orgId') orgId: string) {
    const org = await this.orgProfileService.getProfile(orgId);
    return toOrgProfileResponse(org);
  }

  @Patch()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('org.profile.write')
  @ApiOkResponse({ type: OrgProfileResponseDto })
  async updateProfile(
    @CurrentUser('orgId') orgId: string,
    @Body() dto: UpdateOrgProfileDto,
  ) {
    const org = await this.orgProfileService.updateProfile(orgId, dto);
    return toOrgProfileResponse(org);
  }
}

import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import {
  ResidentProfileResponseDto,
  toResidentProfileResponse,
} from './dto/resident-profile.dto';
import { UpsertResidentProfileDto } from './dto/upsert-resident-profile.dto';
import { ResidentProfilesService } from './resident-profiles.service';

@ApiTags('resident-profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org')
export class ResidentProfilesController {
  constructor(
    private readonly residentProfilesService: ResidentProfilesService,
  ) {}

  @Get('residents/:userId/profile')
  @RequirePermissions('residents.profile.read')
  @ApiOkResponse({ type: ResidentProfileResponseDto })
  async getByUserId(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    const profile = await this.residentProfilesService.getByUserId(
      user,
      userId,
    );
    return toResidentProfileResponse(profile);
  }

  @Put('residents/:userId/profile')
  @RequirePermissions('residents.profile.write')
  @ApiOkResponse({ type: ResidentProfileResponseDto })
  async upsertByUserId(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpsertResidentProfileDto,
  ) {
    const profile = await this.residentProfilesService.upsertByUserId(
      user,
      userId,
      dto,
    );
    return toResidentProfileResponse(profile);
  }

  @Get('me/resident-profile')
  @RequirePermissions('residents.profile.read')
  @ApiOkResponse({ type: ResidentProfileResponseDto })
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.residentProfilesService.getMyProfile(user);
    return toResidentProfileResponse(profile);
  }
}

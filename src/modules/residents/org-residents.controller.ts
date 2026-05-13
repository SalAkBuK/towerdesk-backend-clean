import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateOrgResidentDto } from './dto/create-org-resident.dto';
import { CreateOrgResidentResponseDto } from './dto/create-org-resident.response.dto';
import {
  ListOrgResidentsQueryDto,
  OrgResidentListResponseDto,
} from './dto/list-org-residents.dto';
import {
  ListResidentInvitesQueryDto,
  ResidentInviteListResponseDto,
} from './dto/list-resident-invites.dto';
import { toResidentProfileResponse } from './dto/resident-profile.dto';
import { SendResidentInviteResponseDto } from './dto/send-resident-invite.response.dto';
import { ResidentsService } from './residents.service';

@ApiTags('org-residents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/residents')
export class OrgResidentsController {
  constructor(private readonly residentsService: ResidentsService) {}

  @Post()
  @RequirePermissions('residents.write')
  @ApiOkResponse({ type: CreateOrgResidentResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrgResidentDto,
  ): Promise<CreateOrgResidentResponseDto> {
    const result = await this.residentsService.createResidentInOrg(user, dto);
    return {
      user: result.user,
      residentProfile: result.residentProfile
        ? toResidentProfileResponse(result.residentProfile)
        : null,
      tempPassword: result.tempPassword,
      inviteSent: result.inviteSent,
    };
  }

  @Post(':userId/send-invite')
  @RequirePermissions('residents.write')
  @ApiOkResponse({ type: SendResidentInviteResponseDto })
  async sendInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<SendResidentInviteResponseDto> {
    return this.residentsService.sendResidentInvite(user, userId);
  }

  @Get('invites')
  @RequirePermissions('residents.read')
  @ApiOkResponse({ type: ResidentInviteListResponseDto })
  async listInvites(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListResidentInvitesQueryDto,
  ): Promise<ResidentInviteListResponseDto> {
    return this.residentsService.listResidentInvitesInOrg(user, query);
  }

  @Get()
  @RequirePermissions('residents.read')
  @ApiOkResponse({ type: OrgResidentListResponseDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrgResidentsQueryDto,
  ): Promise<OrgResidentListResponseDto> {
    const result = await this.residentsService.listResidentsInOrg(user, query);
    return {
      items: result.items.map((row) => ({
        user: row.user,
        hasActiveOccupancy: row.hasActiveOccupancy,
        residentStatus: row.residentStatus,
        residentProfile: row.residentProfile ?? null,
        lastOccupancy: row.lastOccupancy ?? null,
      })),
      nextCursor: result.nextCursor,
    };
  }
}

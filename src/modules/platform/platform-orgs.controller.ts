import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateOrgDto } from './dto/create-org.dto';
import { CreateOrgAdminDto } from './dto/create-org-admin.dto';
import { OrgAdminResponseDto } from './dto/org-admin.response.dto';
import { OrgResponseDto, toOrgResponse } from './dto/org.response.dto';
import {
  OrgAdminSummaryDto,
  toOrgAdminSummary,
} from './dto/org-admin.summary.dto';
import { PlatformOrgsService } from './platform-orgs.service';

@ApiTags('platform')
@UseGuards(PlatformAuthGuard)
@Controller('platform/orgs')
export class PlatformOrgsController {
  constructor(private readonly platformOrgsService: PlatformOrgsService) {}

  @Post()
  @RequirePermissions('platform.org.create')
  @ApiOkResponse({ type: OrgResponseDto })
  async create(@Body() dto: CreateOrgDto) {
    const org = await this.platformOrgsService.create(dto);
    return toOrgResponse(org);
  }

  @Get()
  @RequirePermissions('platform.org.read')
  @ApiOkResponse({ type: [OrgResponseDto] })
  async list() {
    const orgs = await this.platformOrgsService.listOrgs();
    return orgs.map(toOrgResponse);
  }

  @Post(':orgId/admins')
  @RequirePermissions('platform.org.admin.create')
  @ApiOkResponse({ type: OrgAdminResponseDto })
  createAdmin(@Param('orgId') orgId: string, @Body() dto: CreateOrgAdminDto) {
    return this.platformOrgsService.createOrgAdmin(orgId, dto);
  }

  @Get(':orgId/admins')
  @RequirePermissions('platform.org.admin.read')
  @ApiOkResponse({ type: [OrgAdminSummaryDto] })
  async listAdmins(@Param('orgId') orgId: string) {
    const admins = await this.platformOrgsService.listOrgAdmins(orgId);
    if (admins.length === 0) {
      const org = await this.platformOrgsService.findOrgById(orgId);
      if (!org) {
        throw new NotFoundException('Org not found');
      }
    }
    return admins.map(toOrgAdminSummary);
  }
}

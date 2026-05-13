import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  OrgAdminSummaryDto,
  toOrgAdminSummary,
} from './dto/org-admin.summary.dto';
import { PlatformOrgsService } from './platform-orgs.service';

@ApiTags('platform')
@UseGuards(PlatformAuthGuard)
@Controller('platform/org-admins')
export class PlatformOrgAdminsController {
  constructor(private readonly platformOrgsService: PlatformOrgsService) {}

  @Get()
  @RequirePermissions('platform.org.admin.read')
  @ApiOkResponse({ type: [OrgAdminSummaryDto] })
  async listAll() {
    const admins = await this.platformOrgsService.listAllOrgAdmins();
    return admins.map(toOrgAdminSummary);
  }
}

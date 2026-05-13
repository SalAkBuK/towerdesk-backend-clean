import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ProviderAccessGrantService } from './provider-access-grant.service';
import {
  CreateProviderAccessGrantDto,
  DisableProviderAccessGrantDto,
} from './dto/create-provider-access-grant.dto';
import {
  ServiceProviderAccessGrantResponseDto,
  toServiceProviderAccessGrantResponse,
} from './dto/service-provider.response.dto';

@ApiTags('org-service-provider-access-grants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/service-providers/:providerId/access-grants')
export class ProviderAccessGrantsController {
  constructor(
    private readonly providerAccessGrantService: ProviderAccessGrantService,
  ) {}

  @Get()
  @RequirePermissions('service_providers.read')
  @ApiOkResponse({ type: [ServiceProviderAccessGrantResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
  ) {
    const grants = await this.providerAccessGrantService.listForProvider({
      orgId: user.orgId as string,
      providerId,
    });
    return grants.map(toServiceProviderAccessGrantResponse);
  }

  @Post()
  @RequirePermissions('service_providers.write')
  @ApiOkResponse({ type: ServiceProviderAccessGrantResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Body() dto: CreateProviderAccessGrantDto,
  ) {
    const grant = await this.providerAccessGrantService.createPendingInvite({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      providerId,
      email: dto.email,
    });
    return toServiceProviderAccessGrantResponse(grant);
  }

  @Post(':grantId/resend-invite')
  @RequirePermissions('service_providers.write')
  @ApiOkResponse({ type: ServiceProviderAccessGrantResponseDto })
  async resendInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Param('grantId') grantId: string,
  ) {
    const grant = await this.providerAccessGrantService.resendInvite({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      providerId,
      grantId,
    });
    return toServiceProviderAccessGrantResponse(grant);
  }

  @Post(':grantId/disable')
  @RequirePermissions('service_providers.write')
  @ApiOkResponse({ type: ServiceProviderAccessGrantResponseDto })
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId') providerId: string,
    @Param('grantId') grantId: string,
    @Body() dto: DisableProviderAccessGrantDto,
  ) {
    const grant = await this.providerAccessGrantService.disableGrant({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      providerId,
      grantId,
      verificationMethod: dto.verificationMethod ?? null,
    });
    return toServiceProviderAccessGrantResponse(grant);
  }
}

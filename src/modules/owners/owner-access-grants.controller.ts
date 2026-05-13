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
import { OwnerAccessGrantService } from './owner-access-grant.service';
import {
  ActivateOwnerAccessGrantDto,
  CreateOwnerAccessGrantDto,
  DisableOwnerAccessGrantDto,
  LinkExistingOwnerAccessGrantDto,
} from './dto/create-owner-access-grant.dto';
import { ListOwnerAccessGrantHistoryQueryDto } from './dto/list-owner-access-grant-history.query.dto';
import { ListOwnerAccessGrantsQueryDto } from './dto/list-owner-access-grants.query.dto';
import {
  OwnerAccessGrantAuditResponseDto,
  toOwnerAccessGrantAuditResponse,
} from './dto/owner-access-grant-audit.response.dto';
import {
  OwnerAccessGrantResponseDto,
  toOwnerAccessGrantResponse,
} from './dto/owner-access-grant.response.dto';

@ApiTags('org-owner-access-grants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/owners/:ownerId/access-grants')
export class OwnerAccessGrantsController {
  constructor(
    private readonly ownerAccessGrantService: OwnerAccessGrantService,
  ) {}

  @Get()
  @RequirePermissions('owner_access_grants.read')
  @ApiOkResponse({ type: [OwnerAccessGrantResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Query() query: ListOwnerAccessGrantsQueryDto,
  ) {
    const grants = await this.ownerAccessGrantService.listForOwner({
      orgId: user.orgId as string,
      ownerId,
      status: query.status,
    });
    return grants.map(toOwnerAccessGrantResponse);
  }

  @Get('history')
  @RequirePermissions('owner_access_grants.read')
  @ApiOkResponse({ type: [OwnerAccessGrantAuditResponseDto] })
  async listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Query() query: ListOwnerAccessGrantHistoryQueryDto,
  ) {
    const audits = await this.ownerAccessGrantService.listHistoryForOwner({
      orgId: user.orgId as string,
      ownerId,
      grantId: query.grantId,
      action: query.action,
    });
    return audits.map(toOwnerAccessGrantAuditResponse);
  }

  @Post()
  @RequirePermissions('owner_access_grants.write')
  @ApiOkResponse({ type: OwnerAccessGrantResponseDto })
  async createInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Body() dto: CreateOwnerAccessGrantDto,
  ) {
    const grant = await this.ownerAccessGrantService.createPendingInvite({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      ownerId,
      email: dto.email,
    });
    return toOwnerAccessGrantResponse(grant);
  }

  @Post('link-existing-user')
  @RequirePermissions('owner_access_grants.write')
  @ApiOkResponse({ type: OwnerAccessGrantResponseDto })
  async linkExistingUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Body() dto: LinkExistingOwnerAccessGrantDto,
  ) {
    const grant = await this.ownerAccessGrantService.linkExistingUser({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      ownerId,
      userId: dto.userId,
    });
    return toOwnerAccessGrantResponse(grant);
  }

  @Post(':grantId/activate')
  @RequirePermissions('owner_access_grants.write')
  @ApiOkResponse({ type: OwnerAccessGrantResponseDto })
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Param('grantId') grantId: string,
    @Body() dto: ActivateOwnerAccessGrantDto,
  ) {
    const grant = await this.ownerAccessGrantService.activatePendingGrant({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      ownerId,
      grantId,
      userId: dto.userId,
      verificationMethod: dto.verificationMethod ?? null,
    });
    return toOwnerAccessGrantResponse(grant);
  }

  @Post(':grantId/disable')
  @RequirePermissions('owner_access_grants.write')
  @ApiOkResponse({ type: OwnerAccessGrantResponseDto })
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Param('grantId') grantId: string,
    @Body() dto: DisableOwnerAccessGrantDto,
  ) {
    const grant = await this.ownerAccessGrantService.disableGrant({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      ownerId,
      grantId,
      verificationMethod: dto.verificationMethod ?? null,
    });
    return toOwnerAccessGrantResponse(grant);
  }

  @Post(':grantId/resend-invite')
  @RequirePermissions('owner_access_grants.write')
  @ApiOkResponse({ type: OwnerAccessGrantResponseDto })
  async resendInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ownerId') ownerId: string,
    @Param('grantId') grantId: string,
  ) {
    const grant = await this.ownerAccessGrantService.resendInvite({
      actorUserId: user.sub,
      orgId: user.orgId as string,
      ownerId,
      grantId,
    });
    return toOwnerAccessGrantResponse(grant);
  }
}

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { PartyResolutionService } from '../parties/party-resolution.service';
import { PartyResolutionTokenService } from '../parties/party-resolution-token.service';
import { ResolvePartyDto } from './dto/resolve-party.dto';
import { ResolvePartyResponseDto } from './dto/resolve-party.response.dto';

@ApiTags('org-owners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/owners')
export class OwnerPartyResolutionController {
  constructor(
    private readonly partyResolutionService: PartyResolutionService,
    private readonly resolutionTokenService: PartyResolutionTokenService,
  ) {}

  @Post('resolve-party')
  @RequirePermissions('owner_registry.resolve')
  @ApiOkResponse({ type: ResolvePartyResponseDto })
  async resolveParty(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolvePartyDto,
  ): Promise<ResolvePartyResponseDto> {
    const actorUserId = user.sub;
    const orgId = user.orgId as string;
    const resolved =
      await this.partyResolutionService.findPartyByIdentifierExact(
        { userId: actorUserId, orgId },
        {
          identifierType: dto.identifierType,
          identifierValue: dto.identifierValue,
          countryCode: dto.countryCode,
          issuingAuthority: dto.issuingAuthority,
        },
      );

    if (!resolved.party) {
      return { matchFound: false, party: null, resolutionToken: null };
    }

    return {
      matchFound: true,
      party: {
        partyType: resolved.party.type,
        displayNameEn: resolved.party.displayNameEn,
        displayNameAr: resolved.party.displayNameAr ?? null,
        maskedIdentifier: resolved.maskedIdentifier,
      },
      resolutionToken: await this.resolutionTokenService.sign({
        actorUserId,
        orgId,
        partyId: resolved.party.id,
        identifierType: dto.identifierType,
      }),
    };
  }
}

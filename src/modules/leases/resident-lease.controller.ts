import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { LeaseDocumentDto, toLeaseDocumentDto } from './dto/lease-document.dto';
import { LeaseResponseDto, toLeaseResponse } from './dto/lease.dto';
import { LeaseDocumentsService } from './lease-documents.service';
import { LeasesService } from './leases.service';

@ApiTags('resident-lease')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('resident/lease')
export class ResidentLeaseController {
  constructor(
    private readonly leasesService: LeasesService,
    private readonly leaseDocumentsService: LeaseDocumentsService,
  ) {}

  @Get('active')
  @RequirePermissions('resident.contracts.read')
  @ApiOkResponse({ type: LeaseResponseDto })
  async getActive(@CurrentUser() user: AuthenticatedUser) {
    const lease = await this.leasesService.getActiveLeaseForResident(user);
    return lease ? toLeaseResponse(lease) : null;
  }

  @Get('active/documents')
  @RequirePermissions('resident.contracts.documents.read')
  @ApiOkResponse({ type: [LeaseDocumentDto] })
  async listActiveDocuments(@CurrentUser() user: AuthenticatedUser) {
    const documents =
      await this.leaseDocumentsService.listActiveResidentDocuments(user);
    return documents.map(toLeaseDocumentDto);
  }
}

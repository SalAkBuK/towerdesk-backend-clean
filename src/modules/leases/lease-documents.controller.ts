import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateLeaseDocumentDto } from './dto/create-lease-document.dto';
import { LeaseDocumentDto, toLeaseDocumentDto } from './dto/lease-document.dto';
import { LeaseDocumentsService } from './lease-documents.service';

@ApiTags('lease-documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('org/leases/:leaseId/documents')
export class LeaseDocumentsController {
  constructor(private readonly leaseDocumentsService: LeaseDocumentsService) {}

  @Get()
  @RequirePermissions('leases.documents.read')
  @ApiOkResponse({ type: [LeaseDocumentDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
  ) {
    const documents = await this.leaseDocumentsService.listDocuments(
      user,
      leaseId,
    );
    return documents.map(toLeaseDocumentDto);
  }

  @Post()
  @RequirePermissions('leases.documents.write')
  @ApiOkResponse({ type: LeaseDocumentDto })
  @HttpCode(HttpStatus.OK) // ✅ add this
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Body() dto: CreateLeaseDocumentDto,
  ) {
    const document = await this.leaseDocumentsService.createDocument(
      user,
      leaseId,
      dto,
    );
    return toLeaseDocumentDto(document);
  }

  @Delete(':documentId')
  @RequirePermissions('leases.documents.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leaseId') leaseId: string,
    @Param('documentId') documentId: string,
  ) {
    await this.leaseDocumentsService.deleteDocument(user, leaseId, documentId);
  }
}

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
import { ContractsService } from './contracts.service';
import { ContractResponseDto, toContractResponse } from './dto/contract.dto';
import { CreateLeaseDocumentDto } from './dto/create-lease-document.dto';
import { LeaseDocumentDto, toLeaseDocumentDto } from './dto/lease-document.dto';
import { ListResidentContractsQueryDto } from './dto/list-resident-contracts.query.dto';
import {
  CreateMoveRequestDto,
  ListMoveRequestsQueryDto,
  MoveRequestResponseDto,
} from './dto/move-request.dto';
import { ResidentContractsListResponseDto } from './dto/resident-contracts-list.response.dto';
import {
  CreateResidentContractUploadUrlDto,
  ResidentContractUploadUrlResponseDto,
} from './dto/resident-contract-upload.dto';
import { ResidentLatestContractResponseDto } from './dto/resident-latest-contract.dto';

@ApiTags('resident-contract')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('resident/contracts')
export class ResidentContractController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @RequirePermissions('resident.contracts.read')
  @ApiOkResponse({ type: ResidentContractsListResponseDto })
  async listContracts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListResidentContractsQueryDto,
  ): Promise<ResidentContractsListResponseDto> {
    const result = await this.contractsService.listResidentContracts(
      user,
      query,
    );
    return {
      items: result.items.map(toContractResponse),
      nextCursor: result.nextCursor ?? null,
    };
  }

  @Get('latest')
  @RequirePermissions('resident.contracts.read')
  @ApiOkResponse({ type: ResidentLatestContractResponseDto })
  async getLatest(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ResidentLatestContractResponseDto> {
    const result =
      await this.contractsService.getLatestContractSummaryForResident(user);

    return {
      contract: result.contract ? toContractResponse(result.contract) : null,
      canRequestMoveIn: result.canRequestMoveIn,
      canRequestMoveOut: result.canRequestMoveOut,
      latestMoveInRequestStatus: result.latestMoveInRequestStatus,
      latestMoveOutRequestStatus: result.latestMoveOutRequestStatus,
    };
  }

  @Get(':contractId')
  @RequirePermissions('resident.contracts.read')
  @ApiOkResponse({ type: ContractResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
  ): Promise<ContractResponseDto> {
    const contract = await this.contractsService.getResidentContractById(
      user,
      contractId,
    );
    return toContractResponse(contract);
  }

  @Post(':contractId/move-in-requests')
  @RequirePermissions('resident.moves.create')
  @ApiOkResponse({ type: MoveRequestResponseDto })
  async createMoveInRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Body() dto: CreateMoveRequestDto,
  ) {
    return this.contractsService.createResidentMoveInRequest(
      user,
      contractId,
      dto,
    );
  }

  @Post(':contractId/move-out-requests')
  @RequirePermissions('resident.moves.create')
  @ApiOkResponse({ type: MoveRequestResponseDto })
  async createMoveOutRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Body() dto: CreateMoveRequestDto,
  ) {
    return this.contractsService.createResidentMoveOutRequest(
      user,
      contractId,
      dto,
    );
  }

  @Get(':contractId/move-in-requests')
  @RequirePermissions('resident.moves.read')
  @ApiOkResponse({ type: [MoveRequestResponseDto] })
  async listMoveInRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Query() query: ListMoveRequestsQueryDto,
  ) {
    return this.contractsService.listResidentMoveInRequests(
      user,
      contractId,
      query,
    );
  }

  @Get(':contractId/move-out-requests')
  @RequirePermissions('resident.moves.read')
  @ApiOkResponse({ type: [MoveRequestResponseDto] })
  async listMoveOutRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Query() query: ListMoveRequestsQueryDto,
  ) {
    return this.contractsService.listResidentMoveOutRequests(
      user,
      contractId,
      query,
    );
  }

  @Post(':contractId/documents/upload-url')
  @RequirePermissions('resident.contracts.documents.create')
  @ApiOkResponse({ type: ResidentContractUploadUrlResponseDto })
  async createUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Body() dto: CreateResidentContractUploadUrlDto,
  ): Promise<ResidentContractUploadUrlResponseDto> {
    return this.contractsService.createResidentContractDocumentUploadUrl(
      user,
      contractId,
      dto,
    );
  }

  @Post(':contractId/documents')
  @RequirePermissions('resident.contracts.documents.create')
  @ApiOkResponse({ type: LeaseDocumentDto })
  async createDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Body() dto: CreateLeaseDocumentDto,
  ): Promise<LeaseDocumentDto> {
    const document = await this.contractsService.createResidentContractDocument(
      user,
      contractId,
      dto,
    );
    return toLeaseDocumentDto(document);
  }
}

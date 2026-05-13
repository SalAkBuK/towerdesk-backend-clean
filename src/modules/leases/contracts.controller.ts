import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  BuildingReadAccess,
  BuildingWriteAccess,
} from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ContractsService } from './contracts.service';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { ContractResponseDto, toContractResponse } from './dto/contract.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import {
  ListMoveRequestsQueryDto,
  MoveRequestResponseDto,
} from './dto/move-request.dto';
import { ListOrgContractsQueryDto } from './dto/list-org-contracts.query.dto';
import { RejectMoveRequestDto } from './dto/move-request.dto';
import { ReplaceContractAdditionalTermsDto } from './dto/replace-contract-additional-terms.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

class MoveRequestInboxCountResponseDto {
  @ApiProperty()
  moveInCount!: number;

  @ApiProperty()
  moveOutCount!: number;

  @ApiProperty()
  totalCount!: number;
}

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard)
@Controller('org')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('buildings/:buildingId/contracts')
  @UseGuards(BuildingAccessGuard)
  @BuildingWriteAccess()
  @RequirePermissions('contracts.write')
  @ApiOkResponse({ type: ContractResponseDto })
  async createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateContractDto,
  ) {
    const contract = await this.contractsService.createDraftContract(
      user,
      buildingId,
      dto,
    );
    return toContractResponse(contract);
  }

  @Get('contracts')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.read')
  @ApiOkResponse({ schema: { example: { items: [], nextCursor: null } } })
  async listContracts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrgContractsQueryDto,
  ) {
    const result = await this.contractsService.listContracts(user, query);
    return {
      items: result.items.map(toContractResponse),
      nextCursor: result.nextCursor,
    };
  }

  @Get('contracts/:contractId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.read')
  @ApiOkResponse({ type: ContractResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
  ) {
    const contract = await this.contractsService.getContractById(
      user,
      contractId,
    );
    return toContractResponse(contract);
  }

  @Patch('contracts/:contractId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.write')
  @ApiOkResponse({ type: ContractResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Body() dto: UpdateContractDto,
  ) {
    const contract = await this.contractsService.updateContract(
      user,
      contractId,
      dto,
    );
    return toContractResponse(contract);
  }

  @Post('contracts/:contractId/activate')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.write')
  @ApiOkResponse({ type: ContractResponseDto })
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
  ) {
    const contract = await this.contractsService.activateContract(
      user,
      contractId,
    );
    return toContractResponse(contract);
  }

  @Post('contracts/:contractId/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.write')
  @ApiOkResponse({ type: ContractResponseDto })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Body() dto: CancelContractDto,
  ) {
    const contract = await this.contractsService.cancelContract(
      user,
      contractId,
      dto.reason,
    );
    return toContractResponse(contract);
  }

  @Put('contracts/:contractId/additional-terms')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.write')
  @ApiOkResponse({ type: ContractResponseDto })
  async replaceAdditionalTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
    @Body() dto: ReplaceContractAdditionalTermsDto,
  ) {
    const contract = await this.contractsService.replaceAdditionalTerms(
      user,
      contractId,
      dto,
    );
    return toContractResponse(contract);
  }

  @Get('residents/:userId/contracts/latest')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.read')
  @ApiOkResponse({ type: ContractResponseDto })
  async getLatestForResident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    const contract = await this.contractsService.getLatestContractForResident(
      user,
      userId,
    );
    return contract ? toContractResponse(contract) : null;
  }

  @Get('buildings/:buildingId/move-in-requests')
  @UseGuards(BuildingAccessGuard)
  @BuildingReadAccess()
  @RequirePermissions('contracts.move_requests.review')
  @ApiOkResponse({ type: [MoveRequestResponseDto] })
  async listMoveInRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListMoveRequestsQueryDto,
  ) {
    return this.contractsService.listMoveInRequests(user, buildingId, query);
  }

  @Get('buildings/:buildingId/move-out-requests')
  @UseGuards(BuildingAccessGuard)
  @BuildingReadAccess()
  @RequirePermissions('contracts.move_requests.review')
  @ApiOkResponse({ type: [MoveRequestResponseDto] })
  async listMoveOutRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListMoveRequestsQueryDto,
  ) {
    return this.contractsService.listMoveOutRequests(user, buildingId, query);
  }

  @Get('move-requests/inbox-count')
  @ApiOkResponse({ type: MoveRequestInboxCountResponseDto })
  async getMoveRequestInboxCount(@CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.getMoveRequestInboxCount(user);
  }

  @Post('move-in-requests/:requestId/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.move_requests.review')
  @ApiOkResponse({ type: MoveRequestResponseDto })
  async approveMoveInRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.contractsService.approveMoveInRequest(user, requestId);
  }

  @Post('move-in-requests/:requestId/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.move_requests.review')
  @ApiOkResponse({ type: MoveRequestResponseDto })
  async rejectMoveInRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectMoveRequestDto,
  ) {
    return this.contractsService.rejectMoveInRequest(user, requestId, dto);
  }

  @Post('move-out-requests/:requestId/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.move_requests.review')
  @ApiOkResponse({ type: MoveRequestResponseDto })
  async approveMoveOutRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.contractsService.approveMoveOutRequest(user, requestId);
  }

  @Post('move-out-requests/:requestId/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.move_requests.review')
  @ApiOkResponse({ type: MoveRequestResponseDto })
  async rejectMoveOutRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectMoveRequestDto,
  ) {
    return this.contractsService.rejectMoveOutRequest(user, requestId, dto);
  }

  @Post('contracts/:contractId/move-in/execute')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.move_in.execute')
  @ApiOkResponse({ type: ContractResponseDto })
  async executeMoveIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
  ) {
    const contract = await this.contractsService.executeApprovedMoveIn(
      user,
      contractId,
    );
    return toContractResponse(contract);
  }

  @Post('contracts/:contractId/move-out/execute')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('contracts.move_out.execute')
  @ApiOkResponse({ type: ContractResponseDto })
  async executeMoveOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contractId') contractId: string,
  ) {
    const contract = await this.contractsService.executeApprovedMoveOut(
      user,
      contractId,
    );
    return toContractResponse(contract);
  }
}

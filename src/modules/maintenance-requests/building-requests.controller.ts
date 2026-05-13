import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import {
  BuildingReadAccess,
  BuildingWriteAccess,
} from '../../common/decorators/building-access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { MaintenanceRequestsService } from './maintenance-requests.service';
import { ListBuildingRequestsQueryDto } from './dto/list-building-requests.query.dto';
import {
  BuildingRequestResponseDto,
  toBuildingRequestResponse,
} from './dto/building-request.response.dto';
import { AssignRequestDto } from './dto/assign-request.dto';
import { AssignProviderRequestDto } from './dto/assign-provider-request.dto';
import { AssignProviderWorkerDto } from './dto/assign-provider-worker.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { CreateBuildingRequestCommentDto } from './dto/create-building-request-comment.dto';
import { CreateRequestAttachmentsDto } from './dto/create-request-attachments.dto';
import {
  OverrideOwnerApprovalDto,
  RequireOwnerApprovalDto,
  SubmitRequestEstimateDto,
  UpdateRequestPolicyDto,
} from './dto/require-owner-approval.dto';
import {
  RequestCommentResponseDto,
  toRequestCommentResponse,
} from './dto/request-comment.response.dto';
import { RequestCommentsUnreadCountResponseDto } from './dto/request-comments-unread-count.response.dto';

@ApiTags('building-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId/requests')
export class BuildingRequestsController {
  constructor(private readonly requestsService: MaintenanceRequestsService) {}

  @Get()
  @BuildingReadAccess()
  @RequirePermissions('requests.read')
  @ApiOkResponse({ type: [BuildingRequestResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListBuildingRequestsQueryDto,
  ) {
    const requests = await this.requestsService.listBuildingRequests(
      user,
      buildingId,
      query,
    );
    return requests.map(toBuildingRequestResponse);
  }

  @Get('comments/unread-count')
  @BuildingReadAccess()
  @RequirePermissions('requests.comment')
  @ApiOkResponse({ type: RequestCommentsUnreadCountResponseDto })
  async unreadCommentCount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    const unreadCount = await this.requestsService.countUnreadBuildingComments(
      user,
      buildingId,
    );
    return { unreadCount };
  }

  @Get(':requestId')
  @BuildingReadAccess()
  @RequirePermissions('requests.read')
  @ApiOkResponse({ type: BuildingRequestResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.getBuildingRequest(
      user,
      buildingId,
      requestId,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/assign')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: AssignRequestDto,
  ) {
    const request = await this.requestsService.assignRequest(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/assign-provider')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async assignProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: AssignProviderRequestDto,
  ) {
    const request = await this.requestsService.assignProvider(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/request-estimate')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async requestEstimate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: AssignProviderRequestDto,
  ) {
    const request = await this.requestsService.requestEstimateFromProvider(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/assign-provider-worker')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async assignProviderWorker(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: AssignProviderWorkerDto,
  ) {
    const request = await this.requestsService.assignProviderWorker(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/unassign-provider')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async unassignProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.unassignProvider(
      user,
      buildingId,
      requestId,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/status')
  @BuildingReadAccess()
  @RequirePermissions('requests.update_status')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: UpdateRequestStatusDto,
  ) {
    const request = await this.requestsService.updateRequestStatus(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/cancel')
  @BuildingReadAccess()
  @RequirePermissions('requests.update_status')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.cancelBuildingRequest(
      user,
      buildingId,
      requestId,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/comments')
  @BuildingReadAccess()
  @RequirePermissions('requests.comment')
  @ApiCreatedResponse({ type: RequestCommentResponseDto })
  async addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: CreateBuildingRequestCommentDto,
  ) {
    const comment = await this.requestsService.addBuildingComment(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toRequestCommentResponse(comment);
  }

  @Get(':requestId/comments')
  @BuildingReadAccess()
  @RequirePermissions('requests.comment')
  @ApiOkResponse({ type: [RequestCommentResponseDto] })
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
  ) {
    const comments = await this.requestsService.listBuildingComments(
      user,
      buildingId,
      requestId,
    );
    return comments.map(toRequestCommentResponse);
  }

  @Post(':requestId/attachments')
  @BuildingReadAccess()
  @RequirePermissions('requests.comment')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async addAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: CreateRequestAttachmentsDto,
  ) {
    const request = await this.requestsService.addBuildingAttachments(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/owner-approval/require')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async requireOwnerApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: RequireOwnerApprovalDto,
  ) {
    const request = await this.requestsService.requireOwnerApproval(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/owner-approval/request')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async requestOwnerApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.requestOwnerApproval(
      user,
      buildingId,
      requestId,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/owner-approval/request-now')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async requestOwnerApprovalNow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: RequireOwnerApprovalDto,
  ) {
    const request = await this.requestsService.requestOwnerApprovalNow(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/policy-triage')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async updatePolicyTriage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: UpdateRequestPolicyDto,
  ) {
    const request = await this.requestsService.updateRequestPolicyTriage(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/estimate')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async submitEstimate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: SubmitRequestEstimateDto,
  ) {
    const request = await this.requestsService.submitRequestEstimate(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/owner-approval/resend')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.assign')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async resendOwnerApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.resendOwnerApprovalRequest(
      user,
      buildingId,
      requestId,
    );
    return toBuildingRequestResponse(request);
  }

  @Post(':requestId/owner-approval/override')
  @BuildingWriteAccess(true)
  @RequirePermissions('requests.owner_approval_override')
  @ApiCreatedResponse({ type: BuildingRequestResponseDto })
  async overrideOwnerApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('requestId') requestId: string,
    @Body() dto: OverrideOwnerApprovalDto,
  ) {
    const request = await this.requestsService.overrideOwnerApproval(
      user,
      buildingId,
      requestId,
      dto,
    );
    return toBuildingRequestResponse(request);
  }
}

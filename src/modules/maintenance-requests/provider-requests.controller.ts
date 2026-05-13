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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { MaintenanceRequestsService } from './maintenance-requests.service';
import { AssignProviderWorkerDto } from './dto/assign-provider-worker.dto';
import { CreateRequestAttachmentsDto } from './dto/create-request-attachments.dto';
import { CreateRequestCommentDto } from './dto/create-request-comment.dto';
import { ListProviderRequestsQueryDto } from './dto/list-provider-requests.query.dto';
import {
  ProviderRequestResponseDto,
  toProviderRequestResponse,
} from './dto/provider-request.response.dto';
import {
  RequestCommentResponseDto,
  toRequestCommentResponse,
} from './dto/request-comment.response.dto';
import { RequestCommentsUnreadCountResponseDto } from './dto/request-comments-unread-count.response.dto';
import { SubmitRequestEstimateDto } from './dto/require-owner-approval.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';

@ApiTags('provider-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('provider/requests')
export class ProviderRequestsController {
  constructor(private readonly requestsService: MaintenanceRequestsService) {}

  @Get()
  @ApiOkResponse({ type: [ProviderRequestResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProviderRequestsQueryDto,
  ) {
    const requests = await this.requestsService.listProviderRequests(
      user,
      query,
    );
    return requests.map(toProviderRequestResponse);
  }

  @Get('comments/unread-count')
  @ApiOkResponse({ type: RequestCommentsUnreadCountResponseDto })
  async unreadCommentCount(@CurrentUser() user: AuthenticatedUser) {
    const unreadCount =
      await this.requestsService.countUnreadProviderComments(user);
    return { unreadCount };
  }

  @Get(':requestId')
  @ApiOkResponse({ type: ProviderRequestResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.getProviderRequest(
      user,
      requestId,
    );
    return toProviderRequestResponse(request);
  }

  @Post(':requestId/status')
  @ApiCreatedResponse({ type: ProviderRequestResponseDto })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: UpdateRequestStatusDto,
  ) {
    const request = await this.requestsService.updateProviderRequestStatus(
      user,
      requestId,
      dto,
    );
    return toProviderRequestResponse(request);
  }

  @Post(':requestId/comments')
  @ApiCreatedResponse({ type: RequestCommentResponseDto })
  async addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: CreateRequestCommentDto,
  ) {
    const comment = await this.requestsService.addProviderComment(
      user,
      requestId,
      dto,
    );
    return toRequestCommentResponse(comment);
  }

  @Get(':requestId/comments')
  @ApiOkResponse({ type: [RequestCommentResponseDto] })
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    const comments = await this.requestsService.listProviderComments(
      user,
      requestId,
    );
    return comments.map(toRequestCommentResponse);
  }

  @Post(':requestId/attachments')
  @ApiCreatedResponse({ type: ProviderRequestResponseDto })
  async addAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: CreateRequestAttachmentsDto,
  ) {
    const request = await this.requestsService.addProviderAttachments(
      user,
      requestId,
      dto,
    );
    return toProviderRequestResponse(request);
  }

  @Post(':requestId/estimate')
  @ApiCreatedResponse({ type: ProviderRequestResponseDto })
  async submitEstimate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: SubmitRequestEstimateDto,
  ) {
    const request = await this.requestsService.submitProviderRequestEstimate(
      user,
      requestId,
      dto,
    );
    return toProviderRequestResponse(request);
  }

  @Post(':requestId/assign-worker')
  @ApiCreatedResponse({ type: ProviderRequestResponseDto })
  async assignWorker(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: AssignProviderWorkerDto,
  ) {
    const request = await this.requestsService.assignProviderWorkerFromProvider(
      user,
      requestId,
      dto,
    );
    return toProviderRequestResponse(request);
  }
}

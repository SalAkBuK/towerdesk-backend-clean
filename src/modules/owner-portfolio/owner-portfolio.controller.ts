import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnerPortfolioGuard } from '../../common/guards/owner-portfolio.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateRequestCommentDto } from '../maintenance-requests/dto/create-request-comment.dto';
import {
  RequestCommentResponseDto,
  toRequestCommentResponse,
} from '../maintenance-requests/dto/request-comment.response.dto';
import {
  OwnerPortfolioRequestResponseDto,
  toOwnerPortfolioRequestResponse,
} from './dto/owner-portfolio-request.response.dto';
import {
  ApproveOwnerRequestDto,
  RejectOwnerRequestDto,
} from './dto/owner-request-approval.dto';
import { OwnerRequestCommentsUnreadCountResponseDto } from './dto/owner-request-comments-unread-count.response.dto';
import { OwnerPortfolioSummaryResponseDto } from './dto/owner-portfolio-summary.response.dto';
import { OwnerPortfolioUnitTenantResponseDto } from './dto/owner-portfolio-unit-tenant.response.dto';
import { OwnerPortfolioUnitResponseDto } from './dto/owner-portfolio-unit.response.dto';
import { OwnerPortfolioScopeService } from './owner-portfolio-scope.service';

@ApiTags('owner-portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnerPortfolioGuard)
@Controller('owner/portfolio')
export class OwnerPortfolioController {
  constructor(
    private readonly ownerPortfolioScopeService: OwnerPortfolioScopeService,
  ) {}

  @Get('units')
  @ApiOkResponse({ type: [OwnerPortfolioUnitResponseDto] })
  listUnits(@CurrentUser() user: AuthenticatedUser) {
    return this.ownerPortfolioScopeService.listAccessibleUnits(user.sub);
  }

  @Get('units/:unitId/tenant')
  @ApiOkResponse({
    type: OwnerPortfolioUnitTenantResponseDto,
    description:
      'Returns the active tenant for the unit or null when the unit is accessible but vacant.',
  })
  getUnitTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('unitId') unitId: string,
  ): Promise<OwnerPortfolioUnitTenantResponseDto | null> {
    return this.ownerPortfolioScopeService.getAccessibleUnitTenant(
      user.sub,
      unitId,
    );
  }

  @Get('summary')
  @ApiOkResponse({ type: OwnerPortfolioSummaryResponseDto })
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.ownerPortfolioScopeService.getPortfolioSummary(user.sub);
  }

  @Get('requests')
  @ApiOkResponse({ type: [OwnerPortfolioRequestResponseDto] })
  async listRequests(@CurrentUser() user: AuthenticatedUser) {
    const requests =
      await this.ownerPortfolioScopeService.listAccessibleRequests(user.sub);
    return requests.map(toOwnerPortfolioRequestResponse);
  }

  @Get('requests/comments/unread-count')
  @ApiOkResponse({ type: OwnerRequestCommentsUnreadCountResponseDto })
  async getUnreadCommentCount(@CurrentUser() user: AuthenticatedUser) {
    const unreadCount =
      await this.ownerPortfolioScopeService.countUnreadAccessibleRequestComments(
        user.sub,
      );
    return { unreadCount };
  }

  @Get('requests/:requestId')
  @ApiOkResponse({ type: OwnerPortfolioRequestResponseDto })
  async getRequestById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    const request =
      await this.ownerPortfolioScopeService.getAccessibleRequestById(
        user.sub,
        requestId,
      );
    return toOwnerPortfolioRequestResponse(request);
  }

  @Post('requests/:requestId/approve')
  @ApiOkResponse({ type: OwnerPortfolioRequestResponseDto })
  async approveRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: ApproveOwnerRequestDto,
  ) {
    const request =
      await this.ownerPortfolioScopeService.approveAccessibleRequest(
        user.sub,
        requestId,
        dto.approvalReason ?? null,
      );
    return toOwnerPortfolioRequestResponse(request);
  }

  @Post('requests/:requestId/reject')
  @ApiOkResponse({ type: OwnerPortfolioRequestResponseDto })
  async rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectOwnerRequestDto,
  ) {
    const request =
      await this.ownerPortfolioScopeService.rejectAccessibleRequest(
        user.sub,
        requestId,
        dto.approvalReason,
      );
    return toOwnerPortfolioRequestResponse(request);
  }

  @Get('requests/:requestId/comments')
  @ApiOkResponse({ type: [RequestCommentResponseDto] })
  async listRequestComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    const comments =
      await this.ownerPortfolioScopeService.listAccessibleRequestComments(
        user.sub,
        requestId,
      );
    return comments.map(toRequestCommentResponse);
  }

  @Post('requests/:requestId/comments')
  @ApiOkResponse({ type: RequestCommentResponseDto })
  async addRequestComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: CreateRequestCommentDto,
  ) {
    const comment =
      await this.ownerPortfolioScopeService.addAccessibleRequestComment(
        user.sub,
        requestId,
        dto,
      );
    return toRequestCommentResponse(comment);
  }
}

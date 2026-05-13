import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { MaintenanceRequestsService } from './maintenance-requests.service';
import { CreateResidentRequestDto } from './dto/create-resident-request.dto';
import {
  ResidentRequestResponseDto,
  toResidentRequestResponse,
} from './dto/resident-request.response.dto';
import { UpdateResidentRequestDto } from './dto/update-resident-request.dto';
import { CreateRequestCommentDto } from './dto/create-request-comment.dto';
import {
  RequestCommentResponseDto,
  toRequestCommentResponse,
} from './dto/request-comment.response.dto';

@ApiTags('resident-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('resident/requests')
export class ResidentRequestsController {
  constructor(private readonly requestsService: MaintenanceRequestsService) {}

  @Post()
  @RequirePermissions('resident.requests.create')
  @ApiCreatedResponse({ type: ResidentRequestResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateResidentRequestDto,
  ) {
    const request = await this.requestsService.createResidentRequest(user, dto);
    return toResidentRequestResponse(request);
  }

  @Get()
  @RequirePermissions('resident.requests.read')
  @ApiOkResponse({ type: [ResidentRequestResponseDto] })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const requests = await this.requestsService.listResidentRequests(user);
    return requests.map(toResidentRequestResponse);
  }

  @Get(':requestId')
  @RequirePermissions('resident.requests.read')
  @ApiOkResponse({ type: ResidentRequestResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.getResidentRequest(
      user,
      requestId,
    );
    return toResidentRequestResponse(request);
  }

  @Patch(':requestId')
  @RequirePermissions('resident.requests.update')
  @ApiOkResponse({ type: ResidentRequestResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: UpdateResidentRequestDto,
  ) {
    const request = await this.requestsService.updateResidentRequest(
      user,
      requestId,
      dto,
    );
    return toResidentRequestResponse(request);
  }

  @Post(':requestId/cancel')
  @RequirePermissions('resident.requests.cancel')
  @ApiCreatedResponse({ type: ResidentRequestResponseDto })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.requestsService.cancelResidentRequest(
      user,
      requestId,
    );
    return toResidentRequestResponse(request);
  }

  @Post(':requestId/comments')
  @RequirePermissions('resident.requests.comment')
  @ApiCreatedResponse({ type: RequestCommentResponseDto })
  async addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: CreateRequestCommentDto,
  ) {
    const comment = await this.requestsService.addResidentComment(
      user,
      requestId,
      dto,
    );
    return toRequestCommentResponse(comment);
  }

  @Get(':requestId/comments')
  @RequirePermissions('resident.requests.comment')
  @ApiOkResponse({ type: [RequestCommentResponseDto] })
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    const comments = await this.requestsService.listResidentComments(
      user,
      requestId,
    );
    return comments.map(toRequestCommentResponse);
  }
}

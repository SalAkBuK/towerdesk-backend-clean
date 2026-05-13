import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import {
  ConversationDetailResponseDto,
  toConversationDetailResponse,
} from './dto/conversation.response.dto';
import { CreateResidentManagementConversationDto } from './dto/create-resident-management-conversation.dto';
import { CreateResidentOwnerConversationDto } from './dto/create-resident-owner-conversation.dto';
import { ManagementContactResponseDto } from './dto/management-contact.response.dto';
import { MessagingService } from './messaging.service';

@ApiTags('resident-messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
@Controller('resident/messages')
export class ResidentMessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('management-contacts')
  @RequirePermissions('messaging.write')
  @ApiOkResponse({ type: [ManagementContactResponseDto] })
  async listManagementContacts(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
  ): Promise<ManagementContactResponseDto[]> {
    return this.messagingService.listResidentManagementContacts(user, orgId);
  }

  @Post('management')
  @RequirePermissions('messaging.write')
  @ApiCreatedResponse({ type: ConversationDetailResponseDto })
  async createManagementConversation(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: CreateResidentManagementConversationDto,
  ): Promise<ConversationDetailResponseDto> {
    const conversation =
      await this.messagingService.createResidentConversationWithManagement(
        user,
        orgId,
        dto,
      );
    return toConversationDetailResponse(conversation, user.sub);
  }

  @Post('owner')
  @RequirePermissions('messaging.write')
  @ApiCreatedResponse({ type: ConversationDetailResponseDto })
  async createOwnerConversation(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: CreateResidentOwnerConversationDto,
  ): Promise<ConversationDetailResponseDto> {
    const conversation =
      await this.messagingService.createResidentConversationWithOwner(
        user,
        orgId,
        dto,
      );
    return toConversationDetailResponse(conversation, user.sub);
  }
}

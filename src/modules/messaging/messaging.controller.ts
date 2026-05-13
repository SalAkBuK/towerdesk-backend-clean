import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { AllowAnyScopePermissions } from '../../common/decorators/allow-any-scope-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { MessagingService } from './messaging.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  ConversationDetailResponseDto,
  toConversationResponse,
  toConversationDetailResponse,
} from './dto/conversation.response.dto';
import { MessagingUnreadCountResponseDto } from './dto/messaging-unread-count.response.dto';
import {
  MessageResponseDto,
  toMessageResponse,
} from './dto/message.response.dto';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard)
@Controller('org/conversations')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('messaging.write')
  @ApiCreatedResponse({ type: ConversationDetailResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationDetailResponseDto> {
    const conversation = await this.messagingService.createConversation(
      user,
      orgId,
      dto,
    );
    return toConversationDetailResponse(conversation, user.sub);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('messaging.read')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/ConversationResponseDto' },
        },
        nextCursor: { type: 'string', nullable: true },
      },
    },
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    const { items, nextCursor } = await this.messagingService.listConversations(
      user,
      orgId,
      {
        counterpartyGroup: query.counterpartyGroup,
        type: query.type,
        cursor: query.cursor,
        limit: query.limit,
      },
    );
    return {
      items: items.map((c) => toConversationResponse(c, user.sub)),
      nextCursor,
    };
  }

  @Get('unread-count')
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('messaging.read')
  @ApiOkResponse({ type: MessagingUnreadCountResponseDto })
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
  ) {
    const unreadCount = await this.messagingService.countUnreadMessages(
      user,
      orgId,
    );
    return { unreadCount };
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('messaging.read')
  @ApiOkResponse({ type: ConversationDetailResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Param('id') conversationId: string,
  ): Promise<ConversationDetailResponseDto> {
    const conversation = await this.messagingService.getConversation(
      user,
      orgId,
      conversationId,
    );
    return toConversationDetailResponse(conversation, user.sub);
  }

  @Post(':id/messages')
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('messaging.write')
  @ApiCreatedResponse({ type: MessageResponseDto })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const message = await this.messagingService.sendMessage(
      user,
      orgId,
      conversationId,
      dto.content,
    );
    return toMessageResponse(message);
  }

  @Post(':id/read')
  @HttpCode(200)
  @UseGuards(PermissionsGuard)
  @AllowAnyScopePermissions()
  @RequirePermissions('messaging.read')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
    },
  })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentUser('orgId') orgId: string,
    @Param('id') conversationId: string,
  ) {
    await this.messagingService.markAsRead(user, orgId, conversationId);
    return { success: true };
  }
}

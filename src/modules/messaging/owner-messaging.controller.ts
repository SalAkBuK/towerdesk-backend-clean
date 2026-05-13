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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnerPortfolioGuard } from '../../common/guards/owner-portfolio.guard';
import { AuthenticatedUser } from '../../common/types/request-context';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import {
  MessageResponseDto,
  toMessageResponse,
} from './dto/message.response.dto';
import {
  OwnerConversationDetailResponseDto,
  toOwnerConversationDetailResponse,
  toOwnerConversationResponse,
} from './dto/owner-conversation.response.dto';
import { CreateOwnerManagementConversationDto } from './dto/create-owner-management-conversation.dto';
import { CreateOwnerTenantConversationDto } from './dto/create-owner-tenant-conversation.dto';
import { MessagingUnreadCountResponseDto } from './dto/messaging-unread-count.response.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagingService } from './messaging.service';

@ApiTags('owner-messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnerPortfolioGuard)
@Controller('owner')
export class OwnerMessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('messages/management')
  @ApiCreatedResponse({ type: OwnerConversationDetailResponseDto })
  async createManagementConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOwnerManagementConversationDto,
  ): Promise<OwnerConversationDetailResponseDto> {
    const conversation =
      await this.messagingService.createOwnerConversationWithManagement(
        user,
        dto,
      );
    return toOwnerConversationDetailResponse(conversation, user.sub);
  }

  @Post('messages/tenants')
  @ApiCreatedResponse({ type: OwnerConversationDetailResponseDto })
  async createTenantConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOwnerTenantConversationDto,
  ): Promise<OwnerConversationDetailResponseDto> {
    const conversation =
      await this.messagingService.createOwnerConversationWithTenant(user, dto);
    return toOwnerConversationDetailResponse(conversation, user.sub);
  }

  @Get('conversations')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/OwnerConversationResponseDto' },
        },
        nextCursor: { type: 'string', nullable: true },
      },
    },
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    const { items, nextCursor } =
      await this.messagingService.listOwnerConversations(user, {
        counterpartyGroup: query.counterpartyGroup,
        type: query.type,
        cursor: query.cursor,
        limit: query.limit,
      });
    return {
      items: items.map((conversation) =>
        toOwnerConversationResponse(conversation, user.sub),
      ),
      nextCursor,
    };
  }

  @Get('conversations/unread-count')
  @ApiOkResponse({ type: MessagingUnreadCountResponseDto })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    const unreadCount =
      await this.messagingService.countUnreadOwnerMessages(user);
    return { unreadCount };
  }

  @Get('conversations/:id')
  @ApiOkResponse({ type: OwnerConversationDetailResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ): Promise<OwnerConversationDetailResponseDto> {
    const conversation = await this.messagingService.getOwnerConversation(
      user,
      conversationId,
    );
    return toOwnerConversationDetailResponse(conversation, user.sub);
  }

  @Post('conversations/:id/messages')
  @ApiCreatedResponse({ type: MessageResponseDto })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const message = await this.messagingService.sendOwnerMessage(
      user,
      conversationId,
      dto.content,
    );
    return toMessageResponse(message);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
    },
  })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ) {
    await this.messagingService.markOwnerConversationAsRead(
      user,
      conversationId,
    );
    return { success: true };
  }
}

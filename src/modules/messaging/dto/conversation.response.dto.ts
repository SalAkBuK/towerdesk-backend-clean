import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ConversationCounterpartyGroup,
  ConversationType,
} from '@prisma/client';
import { MessageResponseDto, toMessageResponse } from './message.response.dto';

export class ConversationParticipantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  avatarUrl?: string | null;
}

export class ConversationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ConversationType })
  type!: ConversationType;

  @ApiProperty({ enum: ConversationCounterpartyGroup })
  counterpartyGroup!: ConversationCounterpartyGroup;

  @ApiPropertyOptional({ nullable: true })
  subject?: string | null;

  @ApiPropertyOptional({ nullable: true })
  buildingId?: string | null;

  @ApiProperty({ type: [ConversationParticipantDto] })
  participants!: ConversationParticipantDto[];

  @ApiProperty()
  unreadCount!: number;

  @ApiPropertyOptional({ type: MessageResponseDto, nullable: true })
  lastMessage?: MessageResponseDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ConversationDetailResponseDto extends ConversationResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  messages!: MessageResponseDto[];
}

type ConversationWithRelations = {
  id: string;
  type: ConversationType;
  counterpartyGroup: ConversationCounterpartyGroup;
  subject?: string | null;
  buildingId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: Array<{
    userId: string;
    lastReadAt: Date | null;
    user: { id: string; name?: string | null; avatarUrl?: string | null };
  }>;
  messages: Array<{
    id: string;
    content: string;
    createdAt: Date;
    senderUser: { id: string; name?: string | null; avatarUrl?: string | null };
  }>;
};

export const toConversationResponse = (
  conversation: ConversationWithRelations,
  currentUserId: string,
): ConversationResponseDto => {
  const currentParticipant = conversation.participants.find(
    (p) => p.userId === currentUserId,
  );
  const lastReadAt = currentParticipant?.lastReadAt;

  const unreadCount = lastReadAt
    ? conversation.messages.filter((m) => m.createdAt > lastReadAt).length
    : conversation.messages.length;

  const lastMessage =
    conversation.messages.length > 0
      ? toMessageResponse(
          conversation.messages[conversation.messages.length - 1],
        )
      : null;

  return {
    id: conversation.id,
    type: conversation.type,
    counterpartyGroup: conversation.counterpartyGroup,
    subject: conversation.subject ?? null,
    buildingId: conversation.buildingId ?? null,
    participants: conversation.participants.map((p) => ({
      id: p.user.id,
      name: p.user.name ?? 'Unknown',
      avatarUrl: p.user.avatarUrl ?? null,
    })),
    unreadCount,
    lastMessage,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

export const toConversationDetailResponse = (
  conversation: ConversationWithRelations,
  currentUserId: string,
): ConversationDetailResponseDto => {
  const base = toConversationResponse(conversation, currentUserId);
  return {
    ...base,
    messages: conversation.messages.map(toMessageResponse),
  };
};

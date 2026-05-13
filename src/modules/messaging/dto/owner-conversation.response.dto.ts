import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ConversationResponseDto,
  toConversationResponse,
} from './conversation.response.dto';
import { MessageResponseDto, toMessageResponse } from './message.response.dto';

export class OwnerConversationResponseDto extends ConversationResponseDto {
  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  orgName!: string;

  @ApiPropertyOptional({ nullable: true })
  buildingName?: string | null;
}

export class OwnerConversationDetailResponseDto extends OwnerConversationResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  messages!: MessageResponseDto[];
}

type OwnerConversationWithRelations = Parameters<
  typeof toConversationResponse
>[0] & {
  org: { id: string; name: string };
  building?: { id: string; name: string } | null;
};

export const toOwnerConversationResponse = (
  conversation: OwnerConversationWithRelations,
  currentUserId: string,
): OwnerConversationResponseDto => {
  const base = toConversationResponse(conversation, currentUserId);
  return {
    ...base,
    orgId: conversation.org.id,
    orgName: conversation.org.name,
    buildingName: conversation.building?.name ?? null,
  };
};

export const toOwnerConversationDetailResponse = (
  conversation: OwnerConversationWithRelations,
  currentUserId: string,
): OwnerConversationDetailResponseDto => {
  const base = toOwnerConversationResponse(conversation, currentUserId);
  return {
    ...base,
    messages: conversation.messages.map(toMessageResponse),
  };
};

import { ApiProperty } from '@nestjs/swagger';

export class MessageSenderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  avatarUrl?: string | null;
}

export class MessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  sender!: MessageSenderDto;

  @ApiProperty()
  createdAt!: Date;
}

export const toMessageResponse = (message: {
  id: string;
  content: string;
  createdAt: Date;
  senderUser: { id: string; name?: string | null; avatarUrl?: string | null };
}): MessageResponseDto => ({
  id: message.id,
  content: message.content,
  sender: {
    id: message.senderUser.id,
    name: message.senderUser.name ?? 'Unknown',
    avatarUrl: message.senderUser.avatarUrl ?? null,
  },
  createdAt: message.createdAt,
});

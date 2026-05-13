import { ApiProperty } from '@nestjs/swagger';

export class MessagingUnreadCountResponseDto {
  @ApiProperty()
  unreadCount!: number;
}

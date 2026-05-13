import { ApiProperty } from '@nestjs/swagger';

export class RequestCommentsUnreadCountResponseDto {
  @ApiProperty()
  unreadCount!: number;
}

import { ApiProperty } from '@nestjs/swagger';

export class NotificationsUnreadCountResponseDto {
  @ApiProperty()
  unreadCount!: number;
}

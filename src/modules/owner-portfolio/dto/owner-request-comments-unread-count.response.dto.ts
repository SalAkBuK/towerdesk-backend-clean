import { ApiProperty } from '@nestjs/swagger';

export class OwnerRequestCommentsUnreadCountResponseDto {
  @ApiProperty()
  unreadCount!: number;
}

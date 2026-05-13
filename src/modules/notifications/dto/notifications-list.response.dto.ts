import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationResponseDto } from './notification.response.dto';

export class NotificationsListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

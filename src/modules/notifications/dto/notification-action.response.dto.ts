import { ApiProperty } from '@nestjs/swagger';

export class NotificationActionResponseDto {
  @ApiProperty()
  success!: boolean;
}

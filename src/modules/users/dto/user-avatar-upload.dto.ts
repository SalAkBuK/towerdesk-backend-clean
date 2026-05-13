import { ApiProperty } from '@nestjs/swagger';

export class UserAvatarUploadResponseDto {
  @ApiProperty()
  avatarUrl!: string;
}

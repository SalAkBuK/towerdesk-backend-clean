import { ApiProperty } from '@nestjs/swagger';

export class ResidentAvatarUploadResponseDto {
  @ApiProperty()
  avatarUrl!: string;
}

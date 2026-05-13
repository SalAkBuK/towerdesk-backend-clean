import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrgUserResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  tempPassword?: string;

  @ApiProperty()
  mustChangePassword!: boolean;
}

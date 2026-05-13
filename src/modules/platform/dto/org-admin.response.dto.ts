import { ApiProperty } from '@nestjs/swagger';

export class OrgAdminResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false })
  tempPassword?: string;

  @ApiProperty()
  mustChangePassword!: boolean;
}

import { ApiProperty } from '@nestjs/swagger';

export class ManagementContactResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  avatarUrl?: string | null;
}

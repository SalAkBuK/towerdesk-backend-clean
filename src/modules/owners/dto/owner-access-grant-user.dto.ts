import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OwnerAccessGrantUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  orgId?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OwnerAccountProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;
}

export class OwnerAccessibleProfileResponseDto {
  @ApiProperty()
  ownerId!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  orgName!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  address?: string | null;

  @ApiProperty()
  isActive!: boolean;
}

export class OwnerMeResponseDto {
  @ApiProperty({ type: OwnerAccountProfileResponseDto })
  user!: OwnerAccountProfileResponseDto;

  @ApiProperty({ type: [OwnerAccessibleProfileResponseDto] })
  owners!: OwnerAccessibleProfileResponseDto[];
}

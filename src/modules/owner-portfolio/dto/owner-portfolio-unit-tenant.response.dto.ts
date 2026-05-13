import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OwnerPortfolioUnitTenantResponseDto {
  @ApiProperty()
  occupancyId!: string;

  @ApiProperty()
  tenantUserId!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;
}

import { ApiProperty } from '@nestjs/swagger';

export class OwnerPortfolioUnitResponseDto {
  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  orgName!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  buildingName!: string;

  @ApiProperty()
  unitLabel!: string;
}

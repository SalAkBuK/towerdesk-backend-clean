import { ApiProperty } from '@nestjs/swagger';

export class OwnerPortfolioSummaryResponseDto {
  @ApiProperty()
  unitCount!: number;

  @ApiProperty()
  orgCount!: number;

  @ApiProperty()
  buildingCount!: number;
}

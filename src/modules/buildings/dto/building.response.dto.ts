import { ApiProperty } from '@nestjs/swagger';
import { Building } from '@prisma/client';

export class BuildingResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty({ required: false })
  emirate?: string | null;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ required: false })
  floors?: number | null;

  @ApiProperty({ required: false })
  unitsCount?: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toBuildingResponse = (
  building: Building,
): BuildingResponseDto => ({
  id: building.id,
  orgId: building.orgId,
  name: building.name,
  city: building.city,
  emirate: building.emirate ?? null,
  country: building.country,
  timezone: building.timezone,
  floors: building.floors ?? null,
  unitsCount: building.unitsCount ?? null,
  createdAt: building.createdAt,
  updatedAt: building.updatedAt,
});

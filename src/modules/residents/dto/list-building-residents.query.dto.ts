import { ApiPropertyOptional } from '@nestjs/swagger';
import { OccupancyStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const buildingResidentStatusValues = [
  OccupancyStatus.ACTIVE,
  OccupancyStatus.ENDED,
  'ALL',
] as const;

export type BuildingResidentStatus =
  (typeof buildingResidentStatusValues)[number];

export class ListBuildingResidentsQueryDto {
  @ApiPropertyOptional({
    enum: buildingResidentStatusValues,
    default: OccupancyStatus.ACTIVE,
  })
  @IsOptional()
  @IsString()
  @IsIn(buildingResidentStatusValues)
  status?: BuildingResidentStatus;

  @ApiPropertyOptional({
    description:
      'Include residents without occupancy (filtered by preferredBuildingId)',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeUnassigned?: string;
}

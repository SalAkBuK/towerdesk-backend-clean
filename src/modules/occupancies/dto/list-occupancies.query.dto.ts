import { ApiPropertyOptional } from '@nestjs/swagger';
import { OccupancyStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const occupancyStatusFilterValues = [
  OccupancyStatus.ACTIVE,
  OccupancyStatus.ENDED,
  'ALL',
] as const;

export type OccupancyStatusFilterQuery =
  (typeof occupancyStatusFilterValues)[number];

export const occupancySortValues = [
  'createdAt',
  'startAt',
  'residentName',
  'unitLabel',
] as const;

export type OccupancySortField = (typeof occupancySortValues)[number];

export const occupancyOrderValues = ['asc', 'desc'] as const;

export type OccupancySortOrder = (typeof occupancyOrderValues)[number];

export class ListOccupanciesQueryDto {
  @ApiPropertyOptional({
    enum: occupancyStatusFilterValues,
    default: OccupancyStatus.ACTIVE,
  })
  @IsOptional()
  @IsString()
  @IsIn(occupancyStatusFilterValues)
  status?: OccupancyStatusFilterQuery;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (max 100)', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search by name, email, or unit label' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: occupancySortValues,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(occupancySortValues)
  sort?: OccupancySortField;

  @ApiPropertyOptional({
    enum: occupancyOrderValues,
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(occupancyOrderValues)
  order?: OccupancySortOrder;

  @ApiPropertyOptional({ description: 'Include resident profile fields' })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeProfile?: string;
}

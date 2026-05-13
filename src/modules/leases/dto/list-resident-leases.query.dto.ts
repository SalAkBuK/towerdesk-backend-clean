import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const residentLeaseStatusValues = [
  LeaseStatus.ACTIVE,
  LeaseStatus.ENDED,
  'ALL',
] as const;

export type ResidentLeaseStatusFilter =
  (typeof residentLeaseStatusValues)[number];

export const residentLeaseOrderValues = ['asc', 'desc'] as const;
export type ResidentLeaseOrder = (typeof residentLeaseOrderValues)[number];

export class ListResidentLeasesQueryDto {
  @ApiPropertyOptional({
    enum: residentLeaseStatusValues,
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  @IsIn(residentLeaseStatusValues)
  status?: ResidentLeaseStatusFilter;

  @ApiPropertyOptional({ enum: residentLeaseOrderValues, default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(residentLeaseOrderValues)
  order?: ResidentLeaseOrder;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (max 100)', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

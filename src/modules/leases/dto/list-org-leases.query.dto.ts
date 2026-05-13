import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseStatus } from '@prisma/client';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const orgLeaseStatusValues = [
  LeaseStatus.ACTIVE,
  LeaseStatus.ENDED,
  'ALL',
] as const;

export type OrgLeaseStatusFilter = (typeof orgLeaseStatusValues)[number];

export const orgLeaseOrderValues = ['asc', 'desc'] as const;
export type OrgLeaseOrder = (typeof orgLeaseOrderValues)[number];

export class ListOrgLeasesQueryDto {
  @ApiPropertyOptional({
    enum: orgLeaseStatusValues,
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  @IsIn(orgLeaseStatusValues)
  status?: OrgLeaseStatusFilter;

  @ApiPropertyOptional({ enum: orgLeaseOrderValues, default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(orgLeaseOrderValues)
  order?: OrgLeaseOrder;

  @ApiPropertyOptional({ description: 'Optional building filter' })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional({ description: 'Optional unit filter' })
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Optional resident user filter' })
  @IsOptional()
  @IsString()
  residentUserId?: string;

  @ApiPropertyOptional({
    description:
      'Optional text search (resident name/email, unit label, building name)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Start of leaseStartDate window (inclusive). ISO datetime',
  })
  @IsOptional()
  @IsISO8601()
  date_from?: string;

  @ApiPropertyOptional({
    description: 'End of leaseStartDate window (inclusive). ISO datetime',
  })
  @IsOptional()
  @IsISO8601()
  date_to?: string;

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

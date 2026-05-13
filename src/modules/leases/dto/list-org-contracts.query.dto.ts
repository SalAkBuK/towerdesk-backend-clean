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

export const orgContractStatusValues = [
  LeaseStatus.DRAFT,
  LeaseStatus.ACTIVE,
  LeaseStatus.ENDED,
  LeaseStatus.CANCELLED,
  'ALL',
] as const;

export type OrgContractStatusFilter = (typeof orgContractStatusValues)[number];

export const orgContractOrderValues = ['asc', 'desc'] as const;
export type OrgContractOrder = (typeof orgContractOrderValues)[number];

export class ListOrgContractsQueryDto {
  @ApiPropertyOptional({
    enum: orgContractStatusValues,
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  @IsIn(orgContractStatusValues)
  status?: OrgContractStatusFilter;

  @ApiPropertyOptional({ enum: orgContractOrderValues, default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(orgContractOrderValues)
  order?: OrgContractOrder;

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
      'Optional text search (resident name/email, unit label, building name, ijari)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Start of contract period window (inclusive). ISO datetime',
  })
  @IsOptional()
  @IsISO8601()
  date_from?: string;

  @ApiPropertyOptional({
    description: 'End of contract period window (inclusive). ISO datetime',
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

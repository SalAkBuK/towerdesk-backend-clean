import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const requestTenancyContextLabelValues = [
  'CURRENT_OCCUPANCY',
  'PREVIOUS_OCCUPANCY',
  'NO_ACTIVE_OCCUPANCY',
  'UNKNOWN_TENANCY_CYCLE',
] as const;

export const requestLeaseContextLabelValues = [
  'CURRENT_LEASE',
  'PREVIOUS_LEASE',
  'NO_ACTIVE_LEASE',
  'UNKNOWN_LEASE_CYCLE',
] as const;

export const requestTenancyContextSourceValues = [
  'SNAPSHOT',
  'HISTORICAL_INFERENCE',
  'UNRESOLVED',
] as const;

export const requestLeaseContextSourceValues = [
  'SNAPSHOT',
  'HISTORICAL_INFERENCE',
  'UNRESOLVED',
] as const;

export type RequestTenancyContextLabel =
  (typeof requestTenancyContextLabelValues)[number];
export type RequestLeaseContextLabel =
  (typeof requestLeaseContextLabelValues)[number];
export type RequestTenancyContextSource =
  (typeof requestTenancyContextSourceValues)[number];
export type RequestLeaseContextSource =
  (typeof requestLeaseContextSourceValues)[number];

export class RequestTenancyContextResponseDto {
  @ApiPropertyOptional({ nullable: true })
  occupancyIdAtCreation!: string | null;

  @ApiPropertyOptional({ nullable: true })
  leaseIdAtCreation!: string | null;

  @ApiPropertyOptional({ nullable: true })
  currentOccupancyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  currentLeaseId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  isCurrentOccupancy!: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  isCurrentLease!: boolean | null;

  @ApiProperty({ enum: requestTenancyContextLabelValues })
  label!: RequestTenancyContextLabel;

  @ApiProperty({ enum: requestLeaseContextLabelValues })
  leaseLabel!: RequestLeaseContextLabel;

  @ApiProperty({ enum: requestTenancyContextSourceValues })
  tenancyContextSource!: RequestTenancyContextSource;

  @ApiProperty({ enum: requestLeaseContextSourceValues })
  leaseContextSource!: RequestLeaseContextSource;
}

export type RequestTenancyContextResponse = {
  occupancyIdAtCreation: string | null;
  leaseIdAtCreation: string | null;
  currentOccupancyId: string | null;
  currentLeaseId: string | null;
  isCurrentOccupancy: boolean | null;
  isCurrentLease: boolean | null;
  label: RequestTenancyContextLabel;
  leaseLabel: RequestLeaseContextLabel;
  tenancyContextSource: RequestTenancyContextSource;
  leaseContextSource: RequestLeaseContextSource;
};

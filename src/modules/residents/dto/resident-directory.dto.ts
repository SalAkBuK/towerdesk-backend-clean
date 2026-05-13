import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OccupancyStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type ResidentDirectoryStatusFilter = OccupancyStatus | 'ALL';
export const residentDirectoryStatusValues: ResidentDirectoryStatusFilter[] = [
  OccupancyStatus.ACTIVE,
  OccupancyStatus.ENDED,
  'ALL',
];

export type ResidentDirectorySortField =
  | 'createdAt'
  | 'startAt'
  | 'residentName'
  | 'unitLabel';
export const residentDirectorySortValues: ResidentDirectorySortField[] = [
  'createdAt',
  'startAt',
  'residentName',
  'unitLabel',
];

export type ResidentDirectorySortOrder = 'asc' | 'desc';
export const residentDirectoryOrderValues: ResidentDirectorySortOrder[] = [
  'asc',
  'desc',
];

export class ResidentDirectoryQueryDto {
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
    enum: residentDirectoryStatusValues,
    default: OccupancyStatus.ACTIVE,
  })
  @IsOptional()
  @IsIn(residentDirectoryStatusValues)
  status?: ResidentDirectoryStatusFilter;

  @ApiPropertyOptional({
    enum: residentDirectorySortValues,
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(residentDirectorySortValues)
  sort?: ResidentDirectorySortField;

  @ApiPropertyOptional({
    enum: residentDirectoryOrderValues,
    default: 'desc',
  })
  @IsOptional()
  @IsIn(residentDirectoryOrderValues)
  order?: ResidentDirectorySortOrder;

  @ApiPropertyOptional({ description: 'Include resident profile fields' })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeProfile?: string;
}

export class ResidentDirectoryProfileDto {
  @ApiPropertyOptional()
  emiratesIdNumber?: string | null;

  @ApiPropertyOptional()
  passportNumber?: string | null;

  @ApiPropertyOptional()
  nationality?: string | null;

  @ApiPropertyOptional()
  dateOfBirth?: Date | null;

  @ApiPropertyOptional()
  currentAddress?: string | null;

  @ApiPropertyOptional()
  emergencyContactName?: string | null;

  @ApiPropertyOptional()
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional()
  preferredBuildingId?: string | null;
}

export class ResidentDirectoryLeaseDto {
  @ApiProperty()
  leaseId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  leaseStartDate!: Date;

  @ApiProperty()
  leaseEndDate!: Date;

  @ApiPropertyOptional()
  annualRent?: string | null;
}

export class ResidentDirectoryRowDto {
  @ApiProperty()
  occupancyId!: string;

  @ApiProperty()
  residentUserId!: string;

  @ApiProperty()
  residentName!: string | null;

  @ApiProperty()
  residentEmail!: string;

  @ApiProperty({ required: false })
  residentPhone?: string | null;

  @ApiProperty({ required: false })
  residentAvatarUrl?: string | null;

  @ApiProperty()
  unitId!: string;

  @ApiProperty()
  unitLabel!: string;

  @ApiProperty({ enum: OccupancyStatus })
  status!: OccupancyStatus;

  @ApiProperty()
  startAt!: Date;

  @ApiProperty({ required: false })
  endAt?: Date | null;

  @ApiPropertyOptional({ type: ResidentDirectoryProfileDto, nullable: true })
  profile?: ResidentDirectoryProfileDto | null;

  @ApiPropertyOptional({ type: ResidentDirectoryLeaseDto, nullable: true })
  lease?: ResidentDirectoryLeaseDto | null;

  @ApiPropertyOptional({ nullable: true })
  latestContractId?: string | null;

  @ApiProperty({ default: true })
  canAddContract!: boolean;

  @ApiProperty({ default: false })
  canViewContract!: boolean;

  @ApiProperty({ default: false })
  canRequestMoveIn!: boolean;

  @ApiProperty({ default: false })
  canRequestMoveOut!: boolean;

  @ApiProperty({ default: false })
  canExecuteMoveOut!: boolean;
}

export class ResidentDirectoryResponseDto {
  @ApiProperty({ type: [ResidentDirectoryRowDto] })
  items!: ResidentDirectoryRowDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string;
}

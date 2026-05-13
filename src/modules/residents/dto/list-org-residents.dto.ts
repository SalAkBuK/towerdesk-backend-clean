import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ResidentProfileResponseDto } from './resident-profile.dto';
import { UserResponseDto } from '../../users/dto/user.response.dto';

export const residentListStatusValues = [
  'ALL',
  'WITH_OCCUPANCY',
  'WITHOUT_OCCUPANCY',
  'NEW',
  'FORMER',
] as const;

export type ResidentListStatus = (typeof residentListStatusValues)[number];

export type ResidentStatusCategory = 'ACTIVE' | 'NEW' | 'FORMER';

export class ListOrgResidentsQueryDto {
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

  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: residentListStatusValues, default: 'ALL' })
  @IsOptional()
  @IsIn(residentListStatusValues)
  status?: ResidentListStatus;

  @ApiPropertyOptional({ description: 'Include resident profile fields' })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeProfile?: string;
}

export class LastOccupancyDto {
  @ApiProperty()
  buildingName!: string;

  @ApiProperty()
  unitLabel!: string;

  @ApiPropertyOptional({ nullable: true })
  endAt!: Date | null;
}

export class OrgResidentListRowDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ default: false })
  hasActiveOccupancy!: boolean;

  @ApiProperty({ enum: ['ACTIVE', 'NEW', 'FORMER'] })
  residentStatus!: ResidentStatusCategory;

  @ApiPropertyOptional({ type: ResidentProfileResponseDto, nullable: true })
  residentProfile?: ResidentProfileResponseDto | null;

  @ApiPropertyOptional({ type: LastOccupancyDto, nullable: true })
  lastOccupancy?: LastOccupancyDto | null;
}

export class OrgResidentListResponseDto {
  @ApiProperty({ type: [OrgResidentListRowDto] })
  items!: OrgResidentListRowDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string;
}

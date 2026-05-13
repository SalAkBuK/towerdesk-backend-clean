import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoveRequestStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateMoveRequestDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  requestedMoveAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectMoveRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export const moveRequestStatusValues = [
  MoveRequestStatus.PENDING,
  MoveRequestStatus.APPROVED,
  MoveRequestStatus.REJECTED,
  MoveRequestStatus.CANCELLED,
  MoveRequestStatus.COMPLETED,
  'ALL',
] as const;

export type MoveRequestStatusFilter = (typeof moveRequestStatusValues)[number];

export class ListMoveRequestsQueryDto {
  @ApiPropertyOptional({ enum: moveRequestStatusValues, default: 'PENDING' })
  @IsOptional()
  @IsString()
  @IsIn(moveRequestStatusValues)
  status?: MoveRequestStatusFilter;
}

export class MoveRequestResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  leaseId!: string;

  @ApiProperty()
  residentUserId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiProperty({ enum: MoveRequestStatus })
  status!: MoveRequestStatus;

  @ApiProperty()
  requestedMoveAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedByUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  rejectionReason?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

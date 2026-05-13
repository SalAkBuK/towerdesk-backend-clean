import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseHistoryAction, LeaseStatus } from '@prisma/client';
import { LeaseHistoryActorDto } from './lease-history.dto';

export class ResidentLeaseTimelineLeaseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: LeaseStatus })
  status!: LeaseStatus;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiPropertyOptional({ nullable: true })
  occupancyId!: string | null;

  @ApiProperty()
  leaseStartDate!: Date;

  @ApiProperty()
  leaseEndDate!: Date;
}

export class ResidentLeaseTimelineItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: LeaseHistoryAction })
  action!: LeaseHistoryAction;

  @ApiProperty()
  leaseId!: string;

  @ApiPropertyOptional({ nullable: true })
  changedByUserId!: string | null;

  @ApiProperty({
    description: 'Field-level changes as { field: { from, to } }',
  })
  changes!: unknown;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: LeaseHistoryActorDto, nullable: true })
  changedByUser?: LeaseHistoryActorDto | null;

  @ApiProperty({ type: ResidentLeaseTimelineLeaseDto })
  lease!: ResidentLeaseTimelineLeaseDto;
}

export class ResidentLeaseTimelineResponseDto {
  @ApiProperty({ type: [ResidentLeaseTimelineItemDto] })
  items!: ResidentLeaseTimelineItemDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string;
}

type ResidentTimelineItemSource = {
  id: string;
  action: LeaseHistoryAction;
  leaseId: string;
  changedByUserId: string | null;
  changes: unknown;
  createdAt: Date;
  changedByUser?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  lease: {
    id: string;
    status: LeaseStatus;
    buildingId: string;
    unitId: string;
    occupancyId: string | null;
    leaseStartDate: Date;
    leaseEndDate: Date;
  };
};

export const toResidentLeaseTimelineItemDto = (
  item: ResidentTimelineItemSource,
): ResidentLeaseTimelineItemDto => ({
  id: item.id,
  action: item.action,
  leaseId: item.leaseId,
  changedByUserId: item.changedByUserId ?? null,
  changes: item.changes,
  createdAt: item.createdAt,
  changedByUser: item.changedByUser
    ? {
        id: item.changedByUser.id,
        name: item.changedByUser.name ?? null,
        email: item.changedByUser.email,
      }
    : null,
  lease: {
    id: item.lease.id,
    status: item.lease.status,
    buildingId: item.lease.buildingId,
    unitId: item.lease.unitId,
    occupancyId: item.lease.occupancyId,
    leaseStartDate: item.lease.leaseStartDate,
    leaseEndDate: item.lease.leaseEndDate,
  },
});

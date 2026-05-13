import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseHistory, LeaseHistoryAction } from '@prisma/client';

type LeaseHistoryWithActor = LeaseHistory & {
  changedByUser?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export class LeaseHistoryActorDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiProperty()
  email!: string;
}

export class LeaseHistoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  leaseId!: string;

  @ApiProperty({ enum: LeaseHistoryAction })
  action!: LeaseHistoryAction;

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
}

export const toLeaseHistoryDto = (
  item: LeaseHistoryWithActor,
): LeaseHistoryDto => ({
  id: item.id,
  orgId: item.orgId,
  leaseId: item.leaseId,
  action: item.action,
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
});

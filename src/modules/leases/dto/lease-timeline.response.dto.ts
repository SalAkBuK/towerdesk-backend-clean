import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LeaseActivityAction,
  LeaseActivitySource,
  LeaseHistoryAction,
} from '@prisma/client';
import { LeaseHistoryActorDto } from './lease-history.dto';

export const leaseTimelineEventSourceValues = ['HISTORY', 'ACTIVITY'] as const;
export type LeaseTimelineEventSource =
  (typeof leaseTimelineEventSourceValues)[number];

export class LeaseTimelineItemDto {
  @ApiProperty({
    description: 'Unique timeline id (`history:<id>` or `activity:<id>`)',
  })
  id!: string;

  @ApiProperty({ enum: leaseTimelineEventSourceValues })
  source!: LeaseTimelineEventSource;

  @ApiProperty({
    oneOf: [
      { type: 'string', enum: Object.values(LeaseHistoryAction) },
      { type: 'string', enum: Object.values(LeaseActivityAction) },
    ],
  })
  action!: LeaseHistoryAction | LeaseActivityAction;

  @ApiPropertyOptional({ enum: LeaseActivitySource, nullable: true })
  activitySource?: LeaseActivitySource | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  changedByUserId!: string | null;

  @ApiPropertyOptional({ type: LeaseHistoryActorDto, nullable: true })
  changedByUser?: LeaseHistoryActorDto | null;

  @ApiProperty({
    description:
      'For HISTORY items: { changes }. For ACTIVITY items: { payload }',
  })
  payload!: unknown;
}

export class LeaseTimelineResponseDto {
  @ApiProperty({ type: [LeaseTimelineItemDto] })
  items!: LeaseTimelineItemDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string;
}

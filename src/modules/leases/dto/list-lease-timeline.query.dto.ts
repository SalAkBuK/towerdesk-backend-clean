import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseActivityAction, LeaseHistoryAction } from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const leaseTimelineOrderValues = ['asc', 'desc'] as const;
export type LeaseTimelineOrder = (typeof leaseTimelineOrderValues)[number];

export const leaseTimelineSourceValues = [
  'ALL',
  'HISTORY',
  'ACTIVITY',
] as const;
export type LeaseTimelineSource = (typeof leaseTimelineSourceValues)[number];

export class ListLeaseTimelineQueryDto {
  @ApiPropertyOptional({
    enum: leaseTimelineSourceValues,
    default: 'ALL',
  })
  @IsOptional()
  @IsString()
  @IsIn(leaseTimelineSourceValues)
  source?: LeaseTimelineSource;

  @ApiPropertyOptional({
    enum: LeaseHistoryAction,
    description: 'Optional history action filter',
  })
  @IsOptional()
  @IsString()
  @IsIn([
    LeaseHistoryAction.CREATED,
    LeaseHistoryAction.UPDATED,
    LeaseHistoryAction.MOVED_OUT,
  ])
  historyAction?: LeaseHistoryAction;

  @ApiPropertyOptional({
    enum: LeaseActivityAction,
    description: 'Optional activity action filter',
  })
  @IsOptional()
  @IsString()
  @IsIn([
    LeaseActivityAction.MOVE_IN,
    LeaseActivityAction.MOVE_OUT,
    LeaseActivityAction.DOCUMENT_ADDED,
    LeaseActivityAction.DOCUMENT_DELETED,
    LeaseActivityAction.ACCESS_CARD_ISSUED,
    LeaseActivityAction.ACCESS_CARD_STATUS_CHANGED,
    LeaseActivityAction.ACCESS_CARD_DELETED,
    LeaseActivityAction.PARKING_STICKER_ISSUED,
    LeaseActivityAction.PARKING_STICKER_STATUS_CHANGED,
    LeaseActivityAction.PARKING_STICKER_DELETED,
    LeaseActivityAction.OCCUPANTS_REPLACED,
    LeaseActivityAction.PARKING_ALLOCATED,
    LeaseActivityAction.PARKING_ALLOCATION_ENDED,
    LeaseActivityAction.VEHICLE_ADDED,
    LeaseActivityAction.VEHICLE_UPDATED,
    LeaseActivityAction.VEHICLE_DELETED,
  ])
  activityAction?: LeaseActivityAction;

  @ApiPropertyOptional({ enum: leaseTimelineOrderValues, default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(leaseTimelineOrderValues)
  order?: LeaseTimelineOrder;

  @ApiPropertyOptional({
    description: 'Start of createdAt window (inclusive). ISO datetime',
  })
  @IsOptional()
  @IsISO8601()
  date_from?: string;

  @ApiPropertyOptional({
    description: 'End of createdAt window (inclusive). ISO datetime',
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

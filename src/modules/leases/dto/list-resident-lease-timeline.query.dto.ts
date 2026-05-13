import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseHistoryAction } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const residentLeaseTimelineOrderValues = ['asc', 'desc'] as const;
export type ResidentLeaseTimelineOrder =
  (typeof residentLeaseTimelineOrderValues)[number];

export class ListResidentLeaseTimelineQueryDto {
  @ApiPropertyOptional({
    enum: LeaseHistoryAction,
    description: 'Optional action filter',
  })
  @IsOptional()
  @IsString()
  @IsIn([
    LeaseHistoryAction.CREATED,
    LeaseHistoryAction.UPDATED,
    LeaseHistoryAction.MOVED_OUT,
  ])
  action?: LeaseHistoryAction;

  @ApiPropertyOptional({
    enum: residentLeaseTimelineOrderValues,
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(residentLeaseTimelineOrderValues)
  order?: ResidentLeaseTimelineOrder;

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

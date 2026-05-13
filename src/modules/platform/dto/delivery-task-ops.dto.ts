import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliveryTaskKind,
  DeliveryTaskStatus,
  PushDeliveryReceiptStatus,
  PushPlatform,
  PushProvider,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class DeliveryTaskCountByStatusDto {
  @ApiProperty({ enum: DeliveryTaskStatus })
  status!: DeliveryTaskStatus;

  @ApiProperty()
  count!: number;
}

export class DeliveryTaskCountByKindDto {
  @ApiProperty({ enum: DeliveryTaskKind })
  kind!: DeliveryTaskKind;

  @ApiProperty()
  count!: number;
}

export class DeliveryTaskTopErrorDto {
  @ApiProperty({ enum: DeliveryTaskKind })
  kind!: DeliveryTaskKind;

  @ApiProperty()
  lastError!: string;

  @ApiProperty()
  count!: number;
}

export class PushReceiptSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  pending!: number;

  @ApiProperty()
  delivered!: number;

  @ApiProperty()
  error!: number;

  @ApiPropertyOptional({ nullable: true })
  latestCheckedAt!: Date | null;
}

export class PushDeliveryReceiptDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PushProvider })
  provider!: PushProvider;

  @ApiProperty({ enum: PushPlatform })
  platform!: PushPlatform;

  @ApiProperty({ enum: PushDeliveryReceiptStatus })
  status!: PushDeliveryReceiptStatus;

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  pushDeviceId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  deviceTokenMasked!: string | null;

  @ApiPropertyOptional({ nullable: true })
  providerTicketId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  providerReceiptId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  details!: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  checkedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class DeliveryTaskOpsSummaryResponseDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  failedCount!: number;

  @ApiPropertyOptional({ nullable: true })
  oldestFailedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  newestFailedAt!: Date | null;

  @ApiProperty({ type: [DeliveryTaskCountByStatusDto] })
  byStatus!: DeliveryTaskCountByStatusDto[];

  @ApiProperty({ type: [DeliveryTaskCountByKindDto] })
  byKind!: DeliveryTaskCountByKindDto[];

  @ApiProperty({ type: [DeliveryTaskTopErrorDto] })
  topErrors!: DeliveryTaskTopErrorDto[];
}

export class RetryFailedDeliveryTasksDto {
  @ApiPropertyOptional({ enum: DeliveryTaskKind })
  @IsOptional()
  @IsEnum(DeliveryTaskKind)
  kind?: DeliveryTaskKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastErrorContains?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RetryFailedDeliveryTasksResponseDto {
  @ApiProperty()
  requested!: number;

  @ApiProperty()
  retried!: number;

  @ApiProperty({ type: [String] })
  sourceTaskIds!: string[];

  @ApiProperty({ type: [String] })
  replacementTaskIds!: string[];
}

export class CleanupDeliveryTasksDto {
  @ApiPropertyOptional({ minimum: 1, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  olderThanDays?: number;

  @ApiPropertyOptional({ enum: DeliveryTaskStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(DeliveryTaskStatus, { each: true })
  statuses?: DeliveryTaskStatus[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean;
}

export class CleanupDeliveryTasksResponseDto {
  @ApiProperty()
  count!: number;

  @ApiProperty()
  olderThan!: Date;

  @ApiProperty()
  olderThanDays!: number;

  @ApiProperty({ enum: DeliveryTaskStatus, isArray: true })
  statuses!: DeliveryTaskStatus[];

  @ApiProperty()
  dryRun!: boolean;
}

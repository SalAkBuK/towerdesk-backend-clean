import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryTaskKind, DeliveryTaskStatus } from '@prisma/client';
import {
  PushDeliveryReceiptDto,
  PushReceiptSummaryDto,
} from './delivery-task-ops.dto';

export class DeliveryTaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: DeliveryTaskKind })
  kind!: DeliveryTaskKind;

  @ApiProperty({ enum: DeliveryTaskStatus })
  status!: DeliveryTaskStatus;

  @ApiProperty()
  queueName!: string;

  @ApiProperty()
  jobName!: string;

  @ApiPropertyOptional({ nullable: true })
  orgId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceId!: string | null;

  @ApiProperty()
  attemptCount!: number;

  @ApiProperty()
  maxAttempts!: number;

  @ApiProperty()
  queuedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  lastAttemptAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  processingStartedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;

  @ApiPropertyOptional({ nullable: true })
  retriedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  replacedByTaskId!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
  })
  payloadSummary!: Record<string, unknown>;

  @ApiPropertyOptional({ type: PushReceiptSummaryDto, nullable: true })
  receiptSummary?: PushReceiptSummaryDto | null;

  @ApiPropertyOptional({ type: [PushDeliveryReceiptDto] })
  providerReceipts?: PushDeliveryReceiptDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class DeliveryTaskListResponseDto {
  @ApiProperty({ type: [DeliveryTaskResponseDto] })
  items!: DeliveryTaskResponseDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class RetryDeliveryTaskResponseDto {
  @ApiProperty()
  sourceTaskId!: string;

  @ApiProperty({ type: DeliveryTaskResponseDto })
  task!: DeliveryTaskResponseDto;
}

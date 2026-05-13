import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceRequestEstimateStatusEnum } from '../maintenance-requests.constants';

export class EstimateWorkflowResponseDto {
  @ApiProperty({ enum: MaintenanceRequestEstimateStatusEnum })
  status!: MaintenanceRequestEstimateStatusEnum;

  @ApiPropertyOptional({ nullable: true })
  requestedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  requestedByUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  dueAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  reminderSentAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  submittedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  submittedByUserId?: string | null;
}

type EstimateWorkflowSnapshot = {
  estimateStatus?: string | null;
  estimateRequestedAt?: Date | null;
  estimateRequestedByUserId?: string | null;
  estimateDueAt?: Date | null;
  estimateReminderSentAt?: Date | null;
  estimateSubmittedAt?: Date | null;
  estimateSubmittedByUserId?: string | null;
};

export const toEstimateWorkflowResponse = (
  request: EstimateWorkflowSnapshot,
): EstimateWorkflowResponseDto => ({
  status:
    (request.estimateStatus as MaintenanceRequestEstimateStatusEnum | null) ??
    MaintenanceRequestEstimateStatusEnum.NOT_REQUESTED,
  requestedAt: request.estimateRequestedAt ?? null,
  requestedByUserId: request.estimateRequestedByUserId ?? null,
  dueAt: request.estimateDueAt ?? null,
  reminderSentAt: request.estimateReminderSentAt ?? null,
  submittedAt: request.estimateSubmittedAt ?? null,
  submittedByUserId: request.estimateSubmittedByUserId ?? null,
});

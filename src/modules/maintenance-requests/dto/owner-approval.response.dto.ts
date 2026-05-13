import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MaintenanceRequestOwnerApprovalDecisionSourceEnum,
  MaintenanceRequestOwnerApprovalStatusEnum,
} from '../maintenance-requests.constants';

export class OwnerApprovalResponseDto {
  @ApiProperty({ enum: MaintenanceRequestOwnerApprovalStatusEnum })
  status!: MaintenanceRequestOwnerApprovalStatusEnum;

  @ApiPropertyOptional({ nullable: true })
  requestedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  requestedByUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  deadlineAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  decidedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  decidedByOwnerUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  reason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  requiredReason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedAmount?: string | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedCurrency?: string | null;

  @ApiPropertyOptional({
    enum: MaintenanceRequestOwnerApprovalDecisionSourceEnum,
    nullable: true,
  })
  decisionSource?: MaintenanceRequestOwnerApprovalDecisionSourceEnum | null;

  @ApiPropertyOptional({ nullable: true })
  overrideReason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  overriddenByUserId?: string | null;
}

type ApprovalSnapshot = {
  ownerApprovalStatus: string;
  ownerApprovalRequestedAt?: Date | null;
  ownerApprovalRequestedByUserId?: string | null;
  ownerApprovalDeadlineAt?: Date | null;
  ownerApprovalDecidedAt?: Date | null;
  ownerApprovalDecidedByOwnerUserId?: string | null;
  ownerApprovalReason?: string | null;
  approvalRequiredReason?: string | null;
  estimatedAmount?: { toString(): string } | string | number | null;
  estimatedCurrency?: string | null;
  isEmergency?: boolean | null;
  isLikeForLike?: boolean | null;
  isUpgrade?: boolean | null;
  isMajorReplacement?: boolean | null;
  isResponsibilityDisputed?: boolean | null;
  ownerApprovalDecisionSource?: string | null;
  ownerApprovalOverrideReason?: string | null;
  ownerApprovalOverriddenByUserId?: string | null;
};

const formatAmount = (
  amount?: { toString(): string } | string | number | null,
) => {
  if (amount === null || amount === undefined) {
    return null;
  }
  return amount.toString();
};

export const toOwnerApprovalResponse = (
  request: ApprovalSnapshot,
): OwnerApprovalResponseDto => ({
  status:
    (request.ownerApprovalStatus as
      | MaintenanceRequestOwnerApprovalStatusEnum
      | undefined) ?? MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
  requestedAt: request.ownerApprovalRequestedAt ?? null,
  requestedByUserId: request.ownerApprovalRequestedByUserId ?? null,
  deadlineAt: request.ownerApprovalDeadlineAt ?? null,
  decidedAt: request.ownerApprovalDecidedAt ?? null,
  decidedByOwnerUserId: request.ownerApprovalDecidedByOwnerUserId ?? null,
  reason: request.ownerApprovalReason ?? null,
  requiredReason: request.approvalRequiredReason ?? null,
  estimatedAmount: formatAmount(request.estimatedAmount),
  estimatedCurrency: request.estimatedCurrency ?? null,
  decisionSource:
    (request.ownerApprovalDecisionSource as MaintenanceRequestOwnerApprovalDecisionSourceEnum | null) ??
    null,
  overrideReason: request.ownerApprovalOverrideReason ?? null,
  overriddenByUserId: request.ownerApprovalOverriddenByUserId ?? null,
});

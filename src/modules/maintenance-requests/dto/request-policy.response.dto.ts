import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MaintenanceRequestEmergencySignalEnum,
  MaintenanceRequestPolicyRecommendationEnum,
  MaintenanceRequestPolicyRouteEnum,
} from '../maintenance-requests.constants';
import {
  getMaintenanceRequestPolicyRecommendation,
  getMaintenanceRequestPolicyRoute,
  getMaintenanceRequestPolicySummary,
} from '../maintenance-request-policy';

export class RequestPolicyResponseDto {
  @ApiProperty()
  isEmergency!: boolean;

  @ApiPropertyOptional({ nullable: true })
  isLikeForLike?: boolean | null;

  @ApiPropertyOptional({
    enum: MaintenanceRequestEmergencySignalEnum,
    isArray: true,
  })
  emergencySignals?: MaintenanceRequestEmergencySignalEnum[];

  @ApiPropertyOptional({ nullable: true })
  isUpgrade?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  isMajorReplacement?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  isResponsibilityDisputed?: boolean | null;

  @ApiProperty({ enum: MaintenanceRequestPolicyRouteEnum })
  route!: MaintenanceRequestPolicyRouteEnum;

  @ApiProperty({ enum: MaintenanceRequestPolicyRecommendationEnum })
  recommendation!: MaintenanceRequestPolicyRecommendationEnum;

  @ApiProperty()
  summary!: string;
}

type PolicySnapshot = {
  title?: string | null;
  description?: string | null;
  type?: string | null;
  priority?: string | null;
  ownerApprovalStatus?: string | null;
  estimateStatus?: string | null;
  estimatedAmount?: { toString(): string } | string | number | null;
  isEmergency?: boolean | null;
  emergencySignals?: string[] | null;
  isLikeForLike?: boolean | null;
  isUpgrade?: boolean | null;
  isMajorReplacement?: boolean | null;
  isResponsibilityDisputed?: boolean | null;
};

export const toRequestPolicyResponse = (
  request: PolicySnapshot,
): RequestPolicyResponseDto => ({
  isEmergency: request.isEmergency ?? false,
  emergencySignals:
    (request.emergencySignals as
      | MaintenanceRequestEmergencySignalEnum[]
      | null) ?? [],
  isLikeForLike: request.isLikeForLike ?? null,
  isUpgrade: request.isUpgrade ?? null,
  isMajorReplacement: request.isMajorReplacement ?? null,
  isResponsibilityDisputed: request.isResponsibilityDisputed ?? null,
  route: getMaintenanceRequestPolicyRoute(request),
  recommendation: getMaintenanceRequestPolicyRecommendation(request),
  summary: getMaintenanceRequestPolicySummary(request),
});

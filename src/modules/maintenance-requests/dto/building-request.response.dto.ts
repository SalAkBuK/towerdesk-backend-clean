import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RequestAttachmentResponseDto,
  toRequestAttachmentResponse,
} from './request-attachment.response.dto';
import {
  OwnerApprovalResponseDto,
  toOwnerApprovalResponse,
} from './owner-approval.response.dto';
import {
  RequestPolicyResponseDto,
  toRequestPolicyResponse,
} from './request-policy.response.dto';
import {
  EstimateWorkflowResponseDto,
  toEstimateWorkflowResponse,
} from './estimate-workflow.response.dto';
import { getPrimaryMaintenanceRequestQueue } from '../maintenance-request-policy';
import { MaintenanceRequestQueueEnum } from '../maintenance-requests.constants';
import {
  RequesterContextResponse,
  RequesterContextResponseDto,
} from './requester-context.response.dto';
import {
  RequestTenancyContextResponse,
  RequestTenancyContextResponseDto,
} from './request-tenancy-context.response.dto';

export class BuildingRequestUserDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiProperty()
  email!: string;
}

export class BuildingRequestUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ nullable: true })
  floor?: number | null;
}

export class BuildingRequestServiceProviderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  serviceCategory?: string | null;
}

export class BuildingRequestResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiPropertyOptional({ type: BuildingRequestUnitDto, nullable: true })
  unit?: BuildingRequestUnitDto | null;

  @ApiProperty({ type: BuildingRequestUserDto })
  createdBy!: BuildingRequestUserDto;

  @ApiProperty({ type: RequesterContextResponseDto })
  requesterContext!: RequesterContextResponseDto;

  @ApiProperty({ type: RequestTenancyContextResponseDto })
  requestTenancyContext!: RequestTenancyContextResponseDto;

  @ApiPropertyOptional({ type: BuildingRequestUserDto, nullable: true })
  assignedTo?: BuildingRequestUserDto | null;

  @ApiPropertyOptional({
    type: BuildingRequestServiceProviderDto,
    nullable: true,
  })
  serviceProvider?: BuildingRequestServiceProviderDto | null;

  @ApiPropertyOptional({ type: BuildingRequestUserDto, nullable: true })
  serviceProviderAssignedTo?: BuildingRequestUserDto | null;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  priority?: string | null;

  @ApiPropertyOptional({ nullable: true })
  type?: string | null;

  @ApiPropertyOptional({ type: [RequestAttachmentResponseDto] })
  attachments?: RequestAttachmentResponseDto[];

  @ApiProperty({ type: OwnerApprovalResponseDto })
  ownerApproval!: OwnerApprovalResponseDto;

  @ApiProperty({ type: RequestPolicyResponseDto })
  policy!: RequestPolicyResponseDto;

  @ApiProperty({ type: EstimateWorkflowResponseDto })
  estimate!: EstimateWorkflowResponseDto;

  @ApiPropertyOptional({ enum: MaintenanceRequestQueueEnum, nullable: true })
  queue?: MaintenanceRequestQueueEnum | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

type RequestWithRelations = {
  id: string;
  buildingId: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  type?: string | null;
  createdAt: Date;
  updatedAt: Date;
  unit?: { id: string; label: string; floor?: number | null } | null;
  createdByUser: { id: string; name?: string | null; email: string };
  assignedToUser?: { id: string; name?: string | null; email: string } | null;
  serviceProvider?: {
    id: string;
    name: string;
    serviceCategory?: string | null;
  } | null;
  serviceProviderAssignedUser?: {
    id: string;
    name?: string | null;
    email: string;
  } | null;
  attachments?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    createdAt: Date;
  }[];
  ownerApprovalStatus: string;
  estimateStatus?: string | null;
  estimateRequestedAt?: Date | null;
  estimateRequestedByUserId?: string | null;
  estimateDueAt?: Date | null;
  estimateReminderSentAt?: Date | null;
  estimateSubmittedAt?: Date | null;
  estimateSubmittedByUserId?: string | null;
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
  requesterContext: RequesterContextResponse;
  requestTenancyContext: RequestTenancyContextResponse;
};

export const toBuildingRequestResponse = (
  request: RequestWithRelations,
): BuildingRequestResponseDto => ({
  id: request.id,
  buildingId: request.buildingId,
  unit: request.unit
    ? {
        id: request.unit.id,
        label: request.unit.label,
        floor: request.unit.floor ?? null,
      }
    : null,
  createdBy: {
    id: request.createdByUser.id,
    name: request.createdByUser.name ?? null,
    email: request.createdByUser.email,
  },
  requesterContext: request.requesterContext,
  requestTenancyContext: request.requestTenancyContext,
  assignedTo: request.assignedToUser
    ? {
        id: request.assignedToUser.id,
        name: request.assignedToUser.name ?? null,
        email: request.assignedToUser.email,
      }
    : null,
  serviceProvider: request.serviceProvider
    ? {
        id: request.serviceProvider.id,
        name: request.serviceProvider.name,
        serviceCategory: request.serviceProvider.serviceCategory ?? null,
      }
    : null,
  serviceProviderAssignedTo: request.serviceProviderAssignedUser
    ? {
        id: request.serviceProviderAssignedUser.id,
        name: request.serviceProviderAssignedUser.name ?? null,
        email: request.serviceProviderAssignedUser.email,
      }
    : null,
  title: request.title,
  description: request.description ?? null,
  status: request.status,
  priority: request.priority ?? null,
  type: request.type ?? null,
  attachments: request.attachments
    ? request.attachments.map((attachment) =>
        toRequestAttachmentResponse(attachment),
      )
    : undefined,
  ownerApproval: toOwnerApprovalResponse(request),
  policy: toRequestPolicyResponse(request),
  estimate: toEstimateWorkflowResponse(request),
  queue: getPrimaryMaintenanceRequestQueue(request),
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

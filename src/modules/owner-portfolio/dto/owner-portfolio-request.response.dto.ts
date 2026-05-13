import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RequestAttachmentResponseDto,
  toRequestAttachmentResponse,
} from '../../maintenance-requests/dto/request-attachment.response.dto';
import {
  OwnerApprovalResponseDto,
  toOwnerApprovalResponse,
} from '../../maintenance-requests/dto/owner-approval.response.dto';
import {
  RequesterContextResponse,
  RequesterContextResponseDto,
} from '../../maintenance-requests/dto/requester-context.response.dto';
import {
  RequestTenancyContextResponse,
  RequestTenancyContextResponseDto,
} from '../../maintenance-requests/dto/request-tenancy-context.response.dto';

class OwnerPortfolioRequestUserDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiProperty()
  email!: string;
}

class OwnerPortfolioRequestUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;
}

type OwnerPortfolioRequestRow = {
  id: string;
  orgId: string;
  orgName: string;
  ownerId: string;
  buildingId: string;
  buildingName: string;
  unitId: string;
  unitLabel: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  type?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name?: string | null;
    email: string;
  };
  assignedTo?: {
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
  ownerApprovalRequestedAt?: Date | null;
  ownerApprovalRequestedByUserId?: string | null;
  ownerApprovalDeadlineAt?: Date | null;
  ownerApprovalDecidedAt?: Date | null;
  ownerApprovalDecidedByOwnerUserId?: string | null;
  ownerApprovalReason?: string | null;
  approvalRequiredReason?: string | null;
  estimatedAmount?: string | null;
  estimatedCurrency?: string | null;
  ownerApprovalDecisionSource?: string | null;
  ownerApprovalOverrideReason?: string | null;
  ownerApprovalOverriddenByUserId?: string | null;
  requesterContext: RequesterContextResponse;
  requestTenancyContext: RequestTenancyContextResponse;
};

export class OwnerPortfolioRequestResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  orgName!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  buildingName!: string;

  @ApiProperty({ type: OwnerPortfolioRequestUnitDto })
  unit!: OwnerPortfolioRequestUnitDto;

  @ApiProperty({ type: OwnerPortfolioRequestUserDto })
  createdBy!: OwnerPortfolioRequestUserDto;

  @ApiProperty({ type: RequesterContextResponseDto })
  requesterContext!: RequesterContextResponseDto;

  @ApiProperty({ type: RequestTenancyContextResponseDto })
  requestTenancyContext!: RequestTenancyContextResponseDto;

  @ApiPropertyOptional({ type: OwnerPortfolioRequestUserDto, nullable: true })
  assignedTo?: OwnerPortfolioRequestUserDto | null;

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

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toOwnerPortfolioRequestResponse = (
  request: OwnerPortfolioRequestRow,
): OwnerPortfolioRequestResponseDto => ({
  id: request.id,
  orgId: request.orgId,
  orgName: request.orgName,
  ownerId: request.ownerId,
  buildingId: request.buildingId,
  buildingName: request.buildingName,
  unit: {
    id: request.unitId,
    label: request.unitLabel,
  },
  createdBy: {
    id: request.createdBy.id,
    name: request.createdBy.name ?? null,
    email: request.createdBy.email,
  },
  requesterContext: request.requesterContext,
  requestTenancyContext: request.requestTenancyContext,
  assignedTo: request.assignedTo
    ? {
        id: request.assignedTo.id,
        name: request.assignedTo.name ?? null,
        email: request.assignedTo.email,
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
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

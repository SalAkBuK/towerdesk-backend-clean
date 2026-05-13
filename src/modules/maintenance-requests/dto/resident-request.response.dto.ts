import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RequestAttachmentResponseDto,
  toRequestAttachmentResponse,
} from './request-attachment.response.dto';
import {
  RequestTenancyContextResponse,
  RequestTenancyContextResponseDto,
} from './request-tenancy-context.response.dto';

export class ResidentRequestAssigneeDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiProperty()
  email!: string;
}

export class ResidentRequestUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;
}

export class ResidentRequestResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty({ type: ResidentRequestUnitDto })
  unit!: ResidentRequestUnitDto;

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

  @ApiPropertyOptional({ type: ResidentRequestAssigneeDto, nullable: true })
  assignedTo?: ResidentRequestAssigneeDto | null;

  @ApiPropertyOptional({ type: [RequestAttachmentResponseDto] })
  attachments?: RequestAttachmentResponseDto[];

  @ApiProperty({ type: RequestTenancyContextResponseDto })
  requestTenancyContext!: RequestTenancyContextResponseDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

type RequestWithRelations = {
  id: string;
  buildingId: string;
  unitId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  type?: string | null;
  createdAt: Date;
  updatedAt: Date;
  unit?: { id: string; label: string } | null;
  assignedToUser?: { id: string; name?: string | null; email: string } | null;
  attachments?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    createdAt: Date;
  }[];
  requestTenancyContext: RequestTenancyContextResponse;
};

export const toResidentRequestResponse = (
  request: RequestWithRelations,
): ResidentRequestResponseDto => ({
  id: request.id,
  buildingId: request.buildingId,
  unit: request.unit
    ? { id: request.unit.id, label: request.unit.label }
    : { id: request.unitId ?? '', label: '' },
  title: request.title,
  description: request.description ?? null,
  status: request.status,
  priority: request.priority ?? null,
  type: request.type ?? null,
  assignedTo: request.assignedToUser
    ? {
        id: request.assignedToUser.id,
        name: request.assignedToUser.name ?? null,
        email: request.assignedToUser.email,
      }
    : null,
  attachments: request.attachments
    ? request.attachments.map((attachment) =>
        toRequestAttachmentResponse(attachment),
      )
    : undefined,
  requestTenancyContext: request.requestTenancyContext,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

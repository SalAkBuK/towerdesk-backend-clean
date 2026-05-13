import { ApiProperty } from '@nestjs/swagger';
import { LeaseDocument, LeaseDocumentType } from '@prisma/client';

export class LeaseDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  leaseId!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty({ enum: LeaseDocumentType })
  type!: LeaseDocumentType;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  createdAt!: Date;
}

export const toLeaseDocumentDto = (
  document: LeaseDocument,
): LeaseDocumentDto => ({
  id: document.id,
  leaseId: document.leaseId,
  orgId: document.orgId,
  type: document.type,
  fileName: document.fileName,
  mimeType: document.mimeType,
  sizeBytes: document.sizeBytes,
  url: document.url,
  createdAt: document.createdAt,
});

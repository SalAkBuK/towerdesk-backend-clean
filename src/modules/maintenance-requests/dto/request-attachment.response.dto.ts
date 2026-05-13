import { ApiProperty } from '@nestjs/swagger';

export class RequestAttachmentResponseDto {
  @ApiProperty()
  id!: string;

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

export const toRequestAttachmentResponse = (attachment: {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
}): RequestAttachmentResponseDto => ({
  id: attachment.id,
  fileName: attachment.fileName,
  mimeType: attachment.mimeType,
  sizeBytes: attachment.sizeBytes,
  url: attachment.url,
  createdAt: attachment.createdAt,
});

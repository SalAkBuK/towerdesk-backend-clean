import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseDocumentType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateResidentContractUploadUrlDto {
  @ApiPropertyOptional({
    enum: LeaseDocumentType,
    default: LeaseDocumentType.SIGNED_TENANCY_CONTRACT,
  })
  @IsOptional()
  @IsEnum(LeaseDocumentType)
  type?: LeaseDocumentType;

  @ApiProperty()
  @IsString()
  fileName!: string;

  @ApiProperty()
  @IsString()
  mimeType!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class ResidentContractUploadUrlResponseDto {
  @ApiProperty()
  uploadUrl!: string;

  @ApiProperty()
  storageUrl!: string;

  @ApiProperty()
  objectKey!: string;

  @ApiProperty({ enum: LeaseDocumentType })
  type!: LeaseDocumentType;

  @ApiProperty()
  expiresInSeconds!: number;
}

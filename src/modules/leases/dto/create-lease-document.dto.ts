import { ApiProperty } from '@nestjs/swagger';
import { LeaseDocumentType } from '@prisma/client';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';

export class CreateLeaseDocumentDto {
  @ApiProperty({ enum: LeaseDocumentType })
  @IsEnum(LeaseDocumentType)
  type!: LeaseDocumentType;

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

  @ApiProperty()
  @IsString()
  url!: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrgBusinessType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class UpdateOrgProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ enum: OrgBusinessType })
  @IsOptional()
  @IsEnum(OrgBusinessType)
  businessType?: OrgBusinessType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeLicenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vatRegistrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registeredOfficeAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  officePhoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  businessEmailAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerName?: string;
}

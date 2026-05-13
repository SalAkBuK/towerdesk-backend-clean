import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyIdentifierType, PartyType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class OwnerIdentifierDto {
  @ApiProperty({ enum: PartyIdentifierType })
  @IsEnum(PartyIdentifierType)
  type!: PartyIdentifierType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issuingAuthority?: string;
}

class OwnerOverridesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayNameOverride?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmailOverride?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhoneOverride?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOwnerDto {
  @ApiProperty({ example: 'Jane Owner' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ enum: PartyType, default: PartyType.INDIVIDUAL })
  @IsOptional()
  @IsEnum(PartyType)
  partyType?: PartyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayNameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayNameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Short-lived signed token from /org/owners/resolve-party',
  })
  @IsOptional()
  @IsString()
  resolutionToken?: string;

  @ApiPropertyOptional({ type: OwnerIdentifierDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerIdentifierDto)
  identifier?: OwnerIdentifierDto;

  @ApiPropertyOptional({ type: OwnerOverridesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerOverridesDto)
  ownerOverrides?: OwnerOverridesDto;
}

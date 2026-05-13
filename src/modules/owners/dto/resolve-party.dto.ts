import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyIdentifierType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class ResolvePartyDto {
  @ApiProperty({ enum: PartyIdentifierType })
  @IsEnum(PartyIdentifierType)
  identifierType!: PartyIdentifierType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  identifierValue!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issuingAuthority?: string;
}

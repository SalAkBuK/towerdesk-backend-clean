import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentFrequency, PropertyUsage } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateContractDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  residentUserId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  contractPeriodFrom!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  contractPeriodTo!: string;

  @ApiProperty()
  @IsString()
  annualRent!: string;

  @ApiProperty({ enum: PaymentFrequency })
  @IsEnum(PaymentFrequency)
  paymentFrequency!: PaymentFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfCheques?: number;

  @ApiProperty()
  @IsString()
  securityDepositAmount!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentModeText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ijariId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  contractDate?: string;

  @ApiPropertyOptional({ enum: PropertyUsage })
  @IsOptional()
  @IsEnum(PropertyUsage)
  propertyUsage?: PropertyUsage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerNameSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  landlordNameSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantNameSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  tenantEmailSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  landlordEmailSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantPhoneSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  landlordPhoneSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingNameSnapshot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationCommunity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertySizeSqm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertyTypeLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertyNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  premisesNoDewa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plotNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalTerms?: string[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FurnishedStatus,
  KitchenType,
  MaintenancePayer,
  PaymentFrequency,
  UnitSizeUnit,
  UnitStatus,
} from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: 'A-101' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  floor?: number;

  @ApiPropertyOptional({ example: 'Near elevator' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: UnitStatus,
    description:
      'Unit availability status (AVAILABLE, OCCUPIED, UNDER_MAINTENANCE, BLOCKED)',
  })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ enum: MaintenancePayer })
  @IsOptional()
  @IsEnum(MaintenancePayer)
  maintenancePayer?: MaintenancePayer;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitSize?: number;

  @ApiPropertyOptional({ enum: UnitSizeUnit })
  @IsOptional()
  @IsEnum(UnitSizeUnit)
  unitSizeUnit?: UnitSizeUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  balcony?: boolean;

  @ApiPropertyOptional({ enum: KitchenType })
  @IsOptional()
  @IsEnum(KitchenType)
  kitchenType?: KitchenType;

  @ApiPropertyOptional({ enum: FurnishedStatus })
  @IsOptional()
  @IsEnum(FurnishedStatus)
  furnishedStatus?: FurnishedStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  rentAnnual?: number;

  @ApiPropertyOptional({ enum: PaymentFrequency })
  @IsOptional()
  @IsEnum(PaymentFrequency)
  paymentFrequency?: PaymentFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  securityDepositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceChargePerUnit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vatApplicable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  electricityMeterNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  waterMeterNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gasMeterNumber?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  amenityIds?: string[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentFrequency, ServiceChargesPaidBy, YesNo } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateLeaseDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsDateString()
  leaseStartDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsDateString()
  leaseEndDate?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Tenancy registration expiry (Ejari/Tawtheeq)',
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsDateString()
  tenancyRegistrationExpiry?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Date tenant gave notice to vacate',
  })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsDateString()
  noticeGivenDate?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString()
  annualRent?: string;

  @ApiPropertyOptional({ enum: PaymentFrequency })
  @ValidateIf((_obj, value) => value !== undefined)
  @IsEnum(PaymentFrequency)
  paymentFrequency?: PaymentFrequency;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  numberOfCheques?: number | null;

  @ApiPropertyOptional()
  @ValidateIf((_obj, value) => value !== undefined)
  @IsString()
  securityDepositAmount?: string;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString()
  internetTvProvider?: string | null;

  @ApiPropertyOptional({ enum: ServiceChargesPaidBy, nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsEnum(ServiceChargesPaidBy)
  serviceChargesPaidBy?: ServiceChargesPaidBy | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsBoolean()
  vatApplicable?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ enum: YesNo, nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsEnum(YesNo)
  firstPaymentReceived?: YesNo | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString()
  firstPaymentAmount?: string | null;

  @ApiPropertyOptional({ enum: YesNo, nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsEnum(YesNo)
  depositReceived?: YesNo | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString()
  depositReceivedAmount?: string | null;
}

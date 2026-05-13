import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentFrequency,
  ServiceChargesPaidBy,
  YesNo,
  LeaseDocumentType,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MoveInResidentDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;
}

class MoveInResidentProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emiratesIdNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}

class MoveInDocumentDto {
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
  @IsNumber()
  sizeBytes!: number;

  @ApiProperty()
  @IsString()
  url!: string;
}

export class MoveInDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  residentUserId?: string;

  @ApiPropertyOptional({ type: MoveInResidentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MoveInResidentDto)
  resident?: MoveInResidentDto;

  @ApiPropertyOptional({ type: MoveInResidentProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MoveInResidentProfileDto)
  residentProfile?: MoveInResidentProfileDto;

  @ApiProperty()
  @IsDateString()
  leaseStartDate!: string;

  @ApiProperty()
  @IsDateString()
  leaseEndDate!: string;

  @ApiPropertyOptional({
    description: 'Tenancy registration expiry (Ejari/Tawtheeq)',
  })
  @IsOptional()
  @IsDateString()
  tenancyRegistrationExpiry?: string;

  @ApiPropertyOptional({ description: 'Date tenant gave notice to vacate' })
  @IsOptional()
  @IsDateString()
  noticeGivenDate?: string;

  @ApiProperty()
  @IsString()
  annualRent!: string;

  @ApiProperty({ enum: PaymentFrequency })
  @IsEnum(PaymentFrequency)
  paymentFrequency!: PaymentFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  numberOfCheques?: number;

  @ApiProperty()
  @IsString()
  securityDepositAmount!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internetTvProvider?: string;

  @ApiPropertyOptional({ enum: ServiceChargesPaidBy })
  @IsOptional()
  @IsEnum(ServiceChargesPaidBy)
  serviceChargesPaidBy?: ServiceChargesPaidBy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vatApplicable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: YesNo })
  @IsOptional()
  @IsEnum(YesNo)
  firstPaymentReceived?: YesNo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstPaymentAmount?: string;

  @ApiPropertyOptional({ enum: YesNo })
  @IsOptional()
  @IsEnum(YesNo)
  depositReceived?: YesNo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  depositReceivedAmount?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  occupantNames?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parkingSlotIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehiclePlateNumbers?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessCardNumbers?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parkingStickerNumbers?: string[];

  @ApiPropertyOptional({ type: [MoveInDocumentDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MoveInDocumentDto)
  documents?: MoveInDocumentDto[];
}

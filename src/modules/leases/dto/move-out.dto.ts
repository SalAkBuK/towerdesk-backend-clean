import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalStatus,
  ConditionStatus,
  RefundMethod,
  YesNo,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class MoveOutDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  actualMoveOutDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forwardingPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forwardingEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forwardingAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalElectricityReading?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalWaterReading?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalGasReading?: string;

  @ApiPropertyOptional({ enum: ConditionStatus })
  @IsOptional()
  @IsEnum(ConditionStatus)
  wallsCondition?: ConditionStatus;

  @ApiPropertyOptional({ enum: ConditionStatus })
  @IsOptional()
  @IsEnum(ConditionStatus)
  floorCondition?: ConditionStatus;

  @ApiPropertyOptional({ enum: ConditionStatus })
  @IsOptional()
  @IsEnum(ConditionStatus)
  kitchenCondition?: ConditionStatus;

  @ApiPropertyOptional({ enum: ConditionStatus })
  @IsOptional()
  @IsEnum(ConditionStatus)
  bathroomCondition?: ConditionStatus;

  @ApiPropertyOptional({ enum: ConditionStatus })
  @IsOptional()
  @IsEnum(ConditionStatus)
  doorsLocksCondition?: ConditionStatus;

  @ApiPropertyOptional({ enum: YesNo })
  @IsOptional()
  @IsEnum(YesNo)
  keysReturned?: YesNo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  accessCardsReturnedCount?: number;

  @ApiPropertyOptional({ enum: YesNo })
  @IsOptional()
  @IsEnum(YesNo)
  parkingStickersReturned?: YesNo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  damageDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  damageCharges?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pendingRent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pendingUtilities?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pendingServiceFines?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  totalDeductions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  netRefund?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inspectionDoneBy?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  inspectionDate?: string;

  @ApiPropertyOptional({ enum: ApprovalStatus })
  @IsOptional()
  @IsEnum(ApprovalStatus)
  managerApproval?: ApprovalStatus;

  @ApiPropertyOptional({ enum: RefundMethod })
  @IsOptional()
  @IsEnum(RefundMethod)
  refundMethod?: RefundMethod;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  refundDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  markAllAccessCardsReturned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  markAllParkingStickersReturned?: boolean;
}

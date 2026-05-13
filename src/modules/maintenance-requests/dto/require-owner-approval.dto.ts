import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { MaintenanceRequestOwnerApprovalDecisionSourceEnum } from '../maintenance-requests.constants';

export class RequestPolicyTriageFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedAmount?: number;

  @ApiPropertyOptional({ example: 'AED' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  estimatedCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isEmergency?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isLikeForLike?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isUpgrade?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isMajorReplacement?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isResponsibilityDisputed?: boolean;
}

export class UpdateRequestPolicyDto extends RequestPolicyTriageFieldsDto {}

export class SubmitRequestEstimateDto extends RequestPolicyTriageFieldsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedAmount!: number;

  @ApiPropertyOptional({ example: 'AED' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  estimatedCurrency?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  approvalRequiredReason?: string;

  @ApiPropertyOptional({
    description:
      'Optional deadline for automated owner approval requests triggered by this estimate',
  })
  @IsOptional()
  @IsDateString()
  ownerApprovalDeadlineAt?: string;
}

export class RequireOwnerApprovalDto extends RequestPolicyTriageFieldsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  approvalRequiredReason!: string;

  @ApiPropertyOptional({
    description: 'Deadline for urgent timeout override eligibility',
  })
  @IsOptional()
  @IsDateString()
  ownerApprovalDeadlineAt?: string;
}

export class OverrideOwnerApprovalDto {
  @ApiProperty({
    enum: [
      MaintenanceRequestOwnerApprovalDecisionSourceEnum.MANAGEMENT_OVERRIDE,
      MaintenanceRequestOwnerApprovalDecisionSourceEnum.EMERGENCY_OVERRIDE,
    ],
  })
  @IsEnum(MaintenanceRequestOwnerApprovalDecisionSourceEnum)
  decisionSource!:
    | MaintenanceRequestOwnerApprovalDecisionSourceEnum.MANAGEMENT_OVERRIDE
    | MaintenanceRequestOwnerApprovalDecisionSourceEnum.EMERGENCY_OVERRIDE;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  ownerApprovalOverrideReason!: string;
}

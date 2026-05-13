import { AccessScopeType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class CreateAccessAssignmentDto {
  @ApiProperty()
  @IsString()
  roleTemplateId!: string;

  @ApiProperty({ enum: AccessScopeType })
  @IsEnum(AccessScopeType)
  scopeType!: AccessScopeType;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Must be null for ORG scope and a building id for BUILDING scope.',
  })
  @ValidateIf(
    (dto: CreateAccessAssignmentDto) =>
      dto.scopeType === AccessScopeType.BUILDING,
  )
  @IsUUID()
  @IsOptional()
  scopeId?: string | null;
}

export class AccessAssignmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  roleTemplateId!: string;

  @ApiProperty()
  roleTemplateKey!: string;

  @ApiProperty({ enum: AccessScopeType })
  scopeType!: AccessScopeType;

  @ApiPropertyOptional({ nullable: true })
  scopeId!: string | null;
}

export const toAccessAssignmentResponse = (assignment: {
  id: string;
  userId: string;
  roleTemplateId: string;
  scopeType: AccessScopeType;
  scopeId: string | null;
  roleTemplate: { key: string };
}): AccessAssignmentResponseDto => ({
  id: assignment.id,
  userId: assignment.userId,
  roleTemplateId: assignment.roleTemplateId,
  roleTemplateKey: assignment.roleTemplate.key,
  scopeType: assignment.scopeType,
  scopeId: assignment.scopeId,
});

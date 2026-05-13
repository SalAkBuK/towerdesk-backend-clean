import { AccessScopeType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ProvisionUserIdentityDto {
  @ApiProperty({ example: 'jane@org.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: 'Jane Admin' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}

export class ProvisionAccessAssignmentDto {
  @ApiPropertyOptional({
    description: 'Preferred canonical selector for the role template.',
  })
  @IsOptional()
  @IsString()
  roleTemplateId?: string;

  @ApiPropertyOptional({
    description:
      'Optional fallback selector used by internal flows that provision known templates by key.',
  })
  @IsOptional()
  @IsString()
  roleTemplateKey?: string;

  @ApiProperty({ enum: AccessScopeType })
  @IsEnum(AccessScopeType)
  scopeType!: AccessScopeType;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Null for ORG assignments, building id for BUILDING assignments.',
  })
  @ValidateIf(
    (dto: ProvisionAccessAssignmentDto) =>
      dto.scopeType === AccessScopeType.BUILDING,
  )
  @IsUUID()
  @IsOptional()
  scopeId?: string | null;
}

export type ResidentGrantMode = 'ADD' | 'MOVE' | 'MOVE_OUT';

export class ResidentGrantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  buildingId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required unless mode is MOVE_OUT',
  })
  @ValidateIf((value) => (value.mode ?? 'ADD') !== 'MOVE_OUT')
  @IsDefined()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ enum: ['ADD', 'MOVE', 'MOVE_OUT'], default: 'ADD' })
  @IsOptional()
  @IsIn(['ADD', 'MOVE', 'MOVE_OUT'])
  mode?: ResidentGrantMode;
}

export type ProvisionIfEmailExists = 'LINK' | 'ERROR';

export class ProvisionModeDto {
  @ApiPropertyOptional({ enum: ['LINK', 'ERROR'], default: 'LINK' })
  @IsOptional()
  @IsIn(['LINK', 'ERROR'])
  ifEmailExists?: ProvisionIfEmailExists;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requireSameOrg?: boolean;
}

export class ProvisionUserDto {
  @ApiProperty({ type: ProvisionUserIdentityDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ProvisionUserIdentityDto)
  identity!: ProvisionUserIdentityDto;

  @ApiPropertyOptional({
    type: [ProvisionAccessAssignmentDto],
    description: 'Canonical staff/admin access assignments to create.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProvisionAccessAssignmentDto)
  accessAssignments?: ProvisionAccessAssignmentDto[];

  @ApiPropertyOptional({
    type: ResidentGrantDto,
    description: 'Resident occupancy linkage to create or update.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResidentGrantDto)
  resident?: ResidentGrantDto;

  @ApiPropertyOptional({ type: ProvisionModeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisionModeDto)
  mode?: ProvisionModeDto;
}

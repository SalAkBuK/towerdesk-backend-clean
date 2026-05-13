import { AccessScopeType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'custom_role' })
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9_]+$/)
  key!: string;

  @ApiProperty({ example: 'Custom Role' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: AccessScopeType })
  @IsEnum(AccessScopeType)
  scopeType!: AccessScopeType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  permissionKeys!: string[];
}

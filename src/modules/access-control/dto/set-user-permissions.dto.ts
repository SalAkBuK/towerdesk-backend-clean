import { ApiProperty } from '@nestjs/swagger';
import { PermissionEffect } from '@prisma/client';
import { IsArray, IsEnum, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UserPermissionOverrideDto {
  @ApiProperty({ example: 'users.read' })
  @IsString()
  permissionKey!: string;

  @ApiProperty({ enum: PermissionEffect })
  @IsEnum(PermissionEffect)
  effect!: PermissionEffect;
}

export class SetUserPermissionsDto {
  @ApiProperty({ type: [UserPermissionOverrideDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserPermissionOverrideDto)
  overrides!: UserPermissionOverrideDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateOwnerAccessGrantDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email!: string;
}

export class LinkExistingOwnerAccessGrantDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}

export class ActivateOwnerAccessGrantDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  verificationMethod?: string;
}

export class DisableOwnerAccessGrantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  verificationMethod?: string;
}

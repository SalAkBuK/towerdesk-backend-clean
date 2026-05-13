import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpsertResidentProfileDto } from './upsert-resident-profile.dto';

export class CreateOrgResidentUserDto {
  @ApiProperty({ example: 'Resident Name' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'resident@org.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+971500000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Send onboarding invite email using password reset flow',
  })
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}

export class CreateOrgResidentDto {
  @ApiProperty({ type: CreateOrgResidentUserDto })
  @ValidateNested()
  @Type(() => CreateOrgResidentUserDto)
  user!: CreateOrgResidentUserDto;

  @ApiPropertyOptional({ type: UpsertResidentProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertResidentProfileDto)
  profile?: UpsertResidentProfileDto;
}

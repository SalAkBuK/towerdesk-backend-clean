import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateResidentDto {
  @ApiProperty({ example: 'Resident Name' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'resident@org.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, example: '+971500000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Send onboarding invite email using password reset flow',
  })
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId!: string;
}

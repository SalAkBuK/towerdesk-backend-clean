import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOrgAdminDto {
  @ApiProperty({ example: 'Org Admin' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'admin@org.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

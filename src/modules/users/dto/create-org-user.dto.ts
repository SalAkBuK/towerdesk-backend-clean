import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateOrgUserDto {
  @ApiProperty({ example: 'User Name' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'user@org.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ example: ['viewer'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleKeys?: string[];
}

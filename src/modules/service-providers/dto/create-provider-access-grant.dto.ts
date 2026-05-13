import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProviderAccessGrantDto {
  @ApiProperty({ example: 'admin@rapidfix.test' })
  @IsEmail()
  email!: string;
}

export class DisableProviderAccessGrantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  verificationMethod?: string;
}

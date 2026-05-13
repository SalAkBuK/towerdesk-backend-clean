import { PushPlatform, PushProvider } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushDeviceDto {
  @ApiProperty({ enum: PushProvider, enumName: 'PushProvider' })
  @IsEnum(PushProvider)
  provider!: PushProvider;

  @ApiProperty({ description: 'Push token issued by the mobile client' })
  @IsString()
  @MaxLength(512)
  token!: string;

  @ApiPropertyOptional({ enum: PushPlatform, enumName: 'PushPlatform' })
  @IsOptional()
  @IsEnum(PushPlatform)
  platform?: PushPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  appId?: string;
}

import { PushPlatform, PushProvider } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PushDeviceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PushProvider, enumName: 'PushProvider' })
  provider!: PushProvider;

  @ApiProperty({ enum: PushPlatform, enumName: 'PushPlatform' })
  platform!: PushPlatform;

  @ApiProperty()
  token!: string;

  @ApiPropertyOptional({ nullable: true })
  deviceId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  appId?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  lastSeenAt!: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toPushDeviceResponse = (device: {
  id: string;
  provider: PushProvider;
  platform: PushPlatform;
  token: string;
  deviceId?: string | null;
  appId?: string | null;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): PushDeviceResponseDto => ({
  id: device.id,
  provider: device.provider,
  platform: device.platform,
  token: device.token,
  deviceId: device.deviceId ?? null,
  appId: device.appId ?? null,
  isActive: device.isActive,
  lastSeenAt: device.lastSeenAt,
  createdAt: device.createdAt,
  updatedAt: device.updatedAt,
});

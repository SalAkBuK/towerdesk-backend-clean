import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class EffectivePermissionsRequestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class EffectivePermissionsEntryDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class EffectivePermissionsResponseDto {
  @ApiProperty({ type: [EffectivePermissionsEntryDto] })
  users!: EffectivePermissionsEntryDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MinLength,
  MaxLength,
  ArrayNotEmpty,
  IsEnum,
} from 'class-validator';
import { BroadcastAudience } from '../broadcasts.constants';

export class CreateBroadcastDto {
  @ApiProperty({ description: 'Broadcast title', minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description: 'Broadcast message body',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({
    description:
      'Target building IDs. Empty or omitted = all accessible buildings',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  buildingIds?: string[];

  @ApiPropertyOptional({
    description:
      'Recipient groups. Defaults to tenants if omitted. If provided, at least one is required.',
    enum: BroadcastAudience,
    isArray: true,
    example: [BroadcastAudience.TENANTS, BroadcastAudience.STAFF],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(BroadcastAudience, { each: true })
  audiences?: BroadcastAudience[];
}

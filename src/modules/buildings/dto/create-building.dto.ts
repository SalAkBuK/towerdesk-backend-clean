import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Central Tower' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'Dubai' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  city!: string;

  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  emirate?: string;

  @ApiPropertyOptional({ example: 'ARE', default: 'ARE' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  country?: string;

  @ApiPropertyOptional({ example: 'Asia/Dubai', default: 'Asia/Dubai' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(1)
  floors?: number;

  @ApiPropertyOptional({ example: 380 })
  @IsOptional()
  @IsInt()
  @Min(1)
  unitsCount?: number;
}

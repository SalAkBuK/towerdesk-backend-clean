import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VisitorType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateResidentVisitorDto {
  @ApiProperty({ enum: VisitorType })
  @IsEnum(VisitorType)
  type!: VisitorType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  visitorName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  phoneNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emiratesId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @ApiPropertyOptional({ description: 'ISO date string' })
  @IsOptional()
  @IsISO8601()
  expectedArrivalAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

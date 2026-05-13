import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ParkingSlotType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateParkingSlotDto {
  @ApiProperty({ example: 'B1-012' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({ example: 'B1' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string | null;

  @ApiProperty({ enum: ParkingSlotType, example: ParkingSlotType.CAR })
  @IsEnum(ParkingSlotType)
  type!: ParkingSlotType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCovered?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

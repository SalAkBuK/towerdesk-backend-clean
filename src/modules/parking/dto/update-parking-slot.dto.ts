import { ApiPropertyOptional } from '@nestjs/swagger';
import { ParkingSlotType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateParkingSlotDto {
  @ApiPropertyOptional({ example: 'B1-015' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ example: 'B2', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string | null;

  @ApiPropertyOptional({ enum: ParkingSlotType, example: ParkingSlotType.EV })
  @IsOptional()
  @IsEnum(ParkingSlotType)
  type?: ParkingSlotType;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isCovered?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

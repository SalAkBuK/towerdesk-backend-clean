import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryTaskKind, DeliveryTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListDeliveryTasksQueryDto {
  @ApiPropertyOptional({ enum: DeliveryTaskKind })
  @IsOptional()
  @IsEnum(DeliveryTaskKind)
  kind?: DeliveryTaskKind;

  @ApiPropertyOptional({ enum: DeliveryTaskStatus })
  @IsOptional()
  @IsEnum(DeliveryTaskStatus)
  status?: DeliveryTaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastErrorContains?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

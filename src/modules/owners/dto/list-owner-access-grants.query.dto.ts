import { ApiPropertyOptional } from '@nestjs/swagger';
import { OwnerAccessGrantStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListOwnerAccessGrantsQueryDto {
  @ApiPropertyOptional({ enum: OwnerAccessGrantStatus })
  @IsOptional()
  @IsEnum(OwnerAccessGrantStatus)
  status?: OwnerAccessGrantStatus;
}

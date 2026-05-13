import { ApiPropertyOptional } from '@nestjs/swagger';
import { VisitorStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListResidentVisitorsQueryDto {
  @ApiPropertyOptional({ enum: VisitorStatus })
  @IsOptional()
  @IsEnum(VisitorStatus)
  status?: VisitorStatus;
}

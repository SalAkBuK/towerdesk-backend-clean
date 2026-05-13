import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class EndParkingAllocationDto {
  @ApiPropertyOptional({
    description: 'ISO date string; defaults to now if omitted',
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

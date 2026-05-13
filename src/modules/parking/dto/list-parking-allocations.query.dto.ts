import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListParkingAllocationsQueryDto {
  @ApiPropertyOptional({
    description: 'When true, only return active (endDate null) allocations',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  active?: boolean;
}

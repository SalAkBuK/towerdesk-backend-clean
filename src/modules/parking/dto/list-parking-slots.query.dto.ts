import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListParkingSlotsQueryDto {
  @ApiPropertyOptional({
    description: 'When true, only return slots without an active allocation',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  available?: boolean;
}

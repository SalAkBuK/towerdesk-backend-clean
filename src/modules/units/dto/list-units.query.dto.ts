import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum UnitInclude {
  OCCUPANCY = 'occupancy',
}

export class ListUnitsQueryDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  available?: boolean;

  @ApiPropertyOptional({
    enum: UnitInclude,
    description:
      'Include related data. Use "occupancy" to include current occupancy and lease details.',
  })
  @IsOptional()
  @IsEnum(UnitInclude)
  include?: UnitInclude;
}

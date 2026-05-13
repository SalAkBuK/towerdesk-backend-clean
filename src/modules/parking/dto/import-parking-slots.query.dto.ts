import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum ParkingSlotsImportMode {
  CREATE = 'create',
  UPSERT = 'upsert',
}

export class ImportParkingSlotsQueryDto {
  @ApiPropertyOptional({
    description:
      'When true, validates rows and returns a summary without writing',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  dryRun?: boolean;

  @ApiPropertyOptional({
    enum: ParkingSlotsImportMode,
    description:
      'create: fail on duplicates; upsert: match by (buildingId,code)',
  })
  @IsOptional()
  @IsEnum(ParkingSlotsImportMode)
  mode?: ParkingSlotsImportMode;
}

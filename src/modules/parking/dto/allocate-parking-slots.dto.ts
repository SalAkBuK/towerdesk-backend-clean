import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class AllocateParkingSlotsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Allocate slots to a specific occupancy',
  })
  @ValidateIf((o) => o.occupancyId !== undefined)
  @IsUUID()
  occupancyId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Allocate slots to a unit (no tenant/occupancy required)',
  })
  @ValidateIf((o) => o.unitId !== undefined)
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Manual selection of slots',
  })
  @ValidateIf((o) => o.slotIds !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  slotIds?: string[];

  @ApiPropertyOptional({
    description: 'Auto-pick this many available slots',
    example: 1,
  })
  @ValidateIf((o) => o.count !== undefined)
  @IsInt()
  @Min(1)
  count?: number;
}

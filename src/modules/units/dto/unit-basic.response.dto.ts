import { ApiProperty } from '@nestjs/swagger';
import { Unit } from '@prisma/client';

export class UnitBasicResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;
}

export const toUnitBasicResponse = (unit: Unit): UnitBasicResponseDto => ({
  id: unit.id,
  label: unit.label,
});

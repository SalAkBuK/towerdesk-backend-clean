import { ApiProperty } from '@nestjs/swagger';
import { Unit } from '@prisma/client';

export class UnitResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ required: false })
  floor?: number | null;

  @ApiProperty({ required: false })
  notes?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toUnitResponse = (unit: Unit): UnitResponseDto => ({
  id: unit.id,
  buildingId: unit.buildingId,
  label: unit.label,
  floor: unit.floor ?? null,
  notes: unit.notes ?? null,
  createdAt: unit.createdAt,
  updatedAt: unit.updatedAt,
});

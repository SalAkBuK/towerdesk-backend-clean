import { ApiProperty } from '@nestjs/swagger';
import { UnitType } from '@prisma/client';

export class UnitTypeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toUnitTypeResponse = (
  unitType: UnitType,
): UnitTypeResponseDto => ({
  id: unitType.id,
  orgId: unitType.orgId,
  name: unitType.name,
  isActive: unitType.isActive,
  createdAt: unitType.createdAt,
  updatedAt: unitType.updatedAt,
});

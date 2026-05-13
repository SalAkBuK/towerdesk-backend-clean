import { ApiProperty } from '@nestjs/swagger';
import { ParkingSlot, ParkingSlotType } from '@prisma/client';

export class ParkingSlotResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ nullable: true })
  level!: string | null;

  @ApiProperty({ enum: ParkingSlotType })
  type!: ParkingSlotType;

  @ApiProperty()
  isCovered!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export const toParkingSlotResponse = (
  slot: ParkingSlot,
): ParkingSlotResponseDto => ({
  id: slot.id,
  orgId: slot.orgId,
  buildingId: slot.buildingId,
  code: slot.code,
  level: slot.level,
  type: slot.type,
  isCovered: slot.isCovered,
  isActive: slot.isActive,
  createdAt: slot.createdAt,
});

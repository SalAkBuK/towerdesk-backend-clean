import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ParkingAllocation,
  ParkingSlot,
  ParkingSlotType,
} from '@prisma/client';

class AllocationSlotSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ nullable: true })
  level!: string | null;

  @ApiProperty({ enum: ParkingSlotType })
  type!: ParkingSlotType;
}

export class ParkingAllocationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  occupancyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  unitId!: string | null;

  @ApiProperty()
  parkingSlotId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  startDate!: Date;

  @ApiProperty({ nullable: true })
  endDate!: Date | null;

  @ApiProperty({ type: AllocationSlotSummaryDto })
  slot!: AllocationSlotSummaryDto;
}

export const toParkingAllocationResponse = (
  allocation: ParkingAllocation & { parkingSlot: ParkingSlot },
): ParkingAllocationResponseDto => ({
  id: allocation.id,
  occupancyId: allocation.occupancyId ?? null,
  unitId: allocation.unitId ?? null,
  parkingSlotId: allocation.parkingSlotId,
  buildingId: allocation.buildingId,
  orgId: allocation.orgId,
  startDate: allocation.startDate,
  endDate: allocation.endDate,
  slot: {
    id: allocation.parkingSlot.id,
    code: allocation.parkingSlot.code,
    level: allocation.parkingSlot.level,
    type: allocation.parkingSlot.type,
  },
});

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Occupancy,
  Unit,
  User,
  Visitor,
  VisitorStatus,
  VisitorType,
} from '@prisma/client';

export class VisitorUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;
}

export class VisitorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty({ enum: VisitorType })
  type!: VisitorType;

  @ApiProperty({ enum: VisitorStatus })
  status!: VisitorStatus;

  @ApiProperty()
  visitorName!: string;

  @ApiProperty()
  phoneNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  emiratesId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  vehicleNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  expectedArrivalAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty({ type: VisitorUnitDto })
  unit!: VisitorUnitDto;

  @ApiPropertyOptional({ nullable: true })
  tenantName?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

type OccupancyWithResident = Occupancy & { residentUser: User };
type UnitWithOccupancy = Unit & { occupancies?: OccupancyWithResident[] };
type VisitorWithRelations = Visitor & { unit: UnitWithOccupancy };

export const toVisitorResponse = (
  visitor: VisitorWithRelations,
): VisitorResponseDto => {
  const occupancy = visitor.unit.occupancies?.[0];
  return {
    id: visitor.id,
    buildingId: visitor.buildingId,
    type: visitor.type,
    status: visitor.status,
    visitorName: visitor.visitorName,
    phoneNumber: visitor.phoneNumber,
    emiratesId: visitor.emiratesId ?? null,
    vehicleNumber: visitor.vehicleNumber ?? null,
    expectedArrivalAt: visitor.expectedArrivalAt ?? null,
    notes: visitor.notes ?? null,
    unit: {
      id: visitor.unit.id,
      label: visitor.unit.label,
    },
    tenantName: occupancy?.residentUser?.name ?? null,
    createdAt: visitor.createdAt,
    updatedAt: visitor.updatedAt,
  };
};

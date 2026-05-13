import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Unit,
  UnitType,
  Occupancy,
  User,
  Lease,
  UnitStatus,
  Building,
} from '@prisma/client';

class OccupantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}

class LeaseInfoDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  leaseEndDate!: Date;

  @ApiPropertyOptional()
  tenancyRegistrationExpiry?: Date | null;

  @ApiPropertyOptional()
  noticeGivenDate?: Date | null;

  @ApiProperty()
  annualRent!: string;
}

class OccupancyInfoDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  startAt!: Date;

  @ApiPropertyOptional()
  endAt?: Date | null;

  @ApiProperty()
  resident!: OccupantDto;

  @ApiPropertyOptional()
  lease?: LeaseInfoDto | null;
}

export class UnitWithOccupancyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  buildingName!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  floor?: number | null;

  @ApiProperty({ enum: UnitStatus })
  status!: UnitStatus;

  @ApiPropertyOptional()
  unitTypeName?: string | null;

  @ApiPropertyOptional()
  occupancy?: OccupancyInfoDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

type UnitWithRelations = Unit & {
  building: Building;
  unitType: UnitType | null;
  occupancies: (Occupancy & {
    residentUser: User;
    lease: Lease | null;
  })[];
};

export const toUnitWithOccupancyResponse = (
  unit: UnitWithRelations,
): UnitWithOccupancyResponseDto => {
  const activeOccupancy = unit.occupancies.find((o) => o.status === 'ACTIVE');

  return {
    id: unit.id,
    buildingId: unit.buildingId,
    buildingName: unit.building.name,
    label: unit.label,
    floor: unit.floor ?? null,
    status: unit.status,
    unitTypeName: unit.unitType?.name ?? null,
    occupancy: activeOccupancy
      ? {
          id: activeOccupancy.id,
          status: activeOccupancy.status,
          startAt: activeOccupancy.startAt,
          endAt: activeOccupancy.endAt ?? null,
          resident: {
            id: activeOccupancy.residentUser.id,
            name: activeOccupancy.residentUser.name ?? '',
            email: activeOccupancy.residentUser.email,
          },
          lease: activeOccupancy.lease
            ? {
                id: activeOccupancy.lease.id,
                leaseEndDate: activeOccupancy.lease.leaseEndDate,
                tenancyRegistrationExpiry:
                  activeOccupancy.lease.tenancyRegistrationExpiry ?? null,
                noticeGivenDate: activeOccupancy.lease.noticeGivenDate ?? null,
                annualRent: activeOccupancy.lease.annualRent.toString(),
              }
            : null,
        }
      : null,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
};

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Occupancy, OccupancyStatus, Unit, User } from '@prisma/client';

export class OccupancyUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;
}

export class OccupancyResidentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false })
  name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  profile?: {
    emiratesIdNumber?: string | null;
    passportNumber?: string | null;
    nationality?: string | null;
    dateOfBirth?: Date | null;
    currentAddress?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
  } | null;
}

export class OccupancyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiProperty()
  residentUserId!: string;

  @ApiProperty({ enum: OccupancyStatus })
  status!: OccupancyStatus;

  @ApiProperty()
  startAt!: Date;

  @ApiProperty({ required: false })
  endAt?: Date | null;

  @ApiProperty({ type: OccupancyUnitDto })
  unit!: OccupancyUnitDto;

  @ApiProperty({ type: OccupancyResidentDto })
  resident!: OccupancyResidentDto;
}

export const toOccupancyResponse = (
  occupancy: Occupancy & {
    unit: Unit;
    residentUser: User & {
      residentProfile?: {
        emiratesIdNumber?: string | null;
        passportNumber?: string | null;
        nationality?: string | null;
        dateOfBirth?: Date | null;
        currentAddress?: string | null;
        emergencyContactName?: string | null;
        emergencyContactPhone?: string | null;
      } | null;
    };
  },
): OccupancyResponseDto => ({
  id: occupancy.id,
  buildingId: occupancy.buildingId,
  unitId: occupancy.unitId,
  residentUserId: occupancy.residentUserId,
  status: occupancy.status,
  startAt: occupancy.startAt,
  endAt: occupancy.endAt ?? null,
  unit: {
    id: occupancy.unit.id,
    label: occupancy.unit.label,
  },
  resident: {
    id: occupancy.residentUser.id,
    email: occupancy.residentUser.email,
    name: occupancy.residentUser.name,
    phone: occupancy.residentUser.phone ?? null,
    avatarUrl: occupancy.residentUser.avatarUrl ?? null,
    profile: occupancy.residentUser.residentProfile
      ? {
          emiratesIdNumber:
            occupancy.residentUser.residentProfile.emiratesIdNumber ?? null,
          passportNumber:
            occupancy.residentUser.residentProfile.passportNumber ?? null,
          nationality:
            occupancy.residentUser.residentProfile.nationality ?? null,
          dateOfBirth:
            occupancy.residentUser.residentProfile.dateOfBirth ?? null,
          currentAddress:
            occupancy.residentUser.residentProfile.currentAddress ?? null,
          emergencyContactName:
            occupancy.residentUser.residentProfile.emergencyContactName ?? null,
          emergencyContactPhone:
            occupancy.residentUser.residentProfile.emergencyContactPhone ??
            null,
        }
      : null,
  },
});

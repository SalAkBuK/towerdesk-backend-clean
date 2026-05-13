import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Building, Occupancy, Unit, User } from '@prisma/client';

export class ResidentMeUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;
}

export class ResidentMeBuildingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;

  @ApiPropertyOptional({ nullable: true })
  emirate!: string | null;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  timezone!: string;
}

export class ResidentMeUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ nullable: true })
  floor!: number | null;
}

export class ResidentMeOccupancyDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  startAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  endAt!: Date | null;

  @ApiProperty({ type: ResidentMeBuildingDto })
  building!: ResidentMeBuildingDto;

  @ApiProperty({ type: ResidentMeUnitDto })
  unit!: ResidentMeUnitDto;
}

export class ResidentMeResponseDto {
  @ApiProperty({ type: ResidentMeUserDto })
  user!: ResidentMeUserDto;

  @ApiPropertyOptional({ type: ResidentMeOccupancyDto, nullable: true })
  occupancy!: ResidentMeOccupancyDto | null;
}

type OccupancyWithRelations = Occupancy & {
  building: Building;
  unit: Unit;
};

export const toResidentMeResponse = (
  user: User,
  occupancy?: OccupancyWithRelations | null,
): ResidentMeResponseDto => ({
  user: {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
    phone: user.phone ?? null,
  },
  occupancy: occupancy
    ? {
        id: occupancy.id,
        status: occupancy.status,
        startAt: occupancy.startAt,
        endAt: occupancy.endAt ?? null,
        building: {
          id: occupancy.building.id,
          name: occupancy.building.name,
          city: occupancy.building.city,
          emirate: occupancy.building.emirate ?? null,
          country: occupancy.building.country,
          timezone: occupancy.building.timezone,
        },
        unit: {
          id: occupancy.unit.id,
          label: occupancy.unit.label,
          floor: occupancy.unit.floor ?? null,
        },
      }
    : null,
});

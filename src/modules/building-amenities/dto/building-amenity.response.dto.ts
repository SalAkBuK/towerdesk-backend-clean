import { ApiProperty } from '@nestjs/swagger';
import { BuildingAmenity } from '@prisma/client';

export class BuildingAmenityResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toBuildingAmenityResponse = (
  amenity: BuildingAmenity,
): BuildingAmenityResponseDto => ({
  id: amenity.id,
  buildingId: amenity.buildingId,
  name: amenity.name,
  isActive: amenity.isActive,
  isDefault: amenity.isDefault,
  createdAt: amenity.createdAt,
  updatedAt: amenity.updatedAt,
});

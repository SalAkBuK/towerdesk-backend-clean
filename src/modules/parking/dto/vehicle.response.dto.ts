import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Vehicle } from '@prisma/client';

export class VehicleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  occupancyId!: string;

  @ApiProperty()
  plateNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  label!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export const toVehicleResponse = (vehicle: Vehicle): VehicleResponseDto => ({
  id: vehicle.id,
  occupancyId: vehicle.occupancyId,
  plateNumber: vehicle.plateNumber,
  label: vehicle.label,
  createdAt: vehicle.createdAt,
});

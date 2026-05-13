import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BuildingAmenity,
  FurnishedStatus,
  KitchenType,
  MaintenancePayer,
  PaymentFrequency,
  Unit,
  UnitAmenity,
  UnitSizeUnit,
} from '@prisma/client';

export class UnitDetailResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  unitTypeId?: string | null;

  @ApiPropertyOptional()
  ownerId?: string | null;

  @ApiPropertyOptional({ enum: MaintenancePayer })
  maintenancePayer?: MaintenancePayer | null;

  @ApiPropertyOptional()
  floor?: number | null;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiPropertyOptional()
  unitSize?: string | null;

  @ApiProperty({ enum: UnitSizeUnit })
  unitSizeUnit!: UnitSizeUnit;

  @ApiPropertyOptional()
  bedrooms?: number | null;

  @ApiPropertyOptional()
  bathrooms?: number | null;

  @ApiPropertyOptional()
  balcony?: boolean | null;

  @ApiPropertyOptional({ enum: KitchenType })
  kitchenType?: KitchenType | null;

  @ApiPropertyOptional({ enum: FurnishedStatus })
  furnishedStatus?: FurnishedStatus | null;

  @ApiPropertyOptional()
  rentAnnual?: string | null;

  @ApiPropertyOptional({ enum: PaymentFrequency })
  paymentFrequency?: PaymentFrequency | null;

  @ApiPropertyOptional()
  securityDepositAmount?: string | null;

  @ApiPropertyOptional()
  serviceChargePerUnit?: string | null;

  @ApiPropertyOptional()
  vatApplicable?: boolean | null;

  @ApiPropertyOptional()
  electricityMeterNumber?: string | null;

  @ApiPropertyOptional()
  waterMeterNumber?: string | null;

  @ApiPropertyOptional()
  gasMeterNumber?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [String] })
  amenityIds!: string[];

  @ApiProperty({ type: [Object] })
  amenities!: { id: string; name: string }[];
}

type UnitAmenityRecord = UnitAmenity & { amenity: BuildingAmenity };
type UnitWithAmenities = Unit & { amenities?: UnitAmenityRecord[] };

export const toUnitDetailResponse = (
  unit: UnitWithAmenities,
): UnitDetailResponseDto => ({
  id: unit.id,
  buildingId: unit.buildingId,
  label: unit.label,
  unitTypeId: unit.unitTypeId ?? null,
  ownerId: unit.ownerId ?? null,
  maintenancePayer: unit.maintenancePayer ?? null,
  floor: unit.floor ?? null,
  notes: unit.notes ?? null,
  unitSize: unit.unitSize?.toString() ?? null,
  unitSizeUnit: unit.unitSizeUnit,
  bedrooms: unit.bedrooms ?? null,
  bathrooms: unit.bathrooms ?? null,
  balcony: unit.balcony ?? null,
  kitchenType: unit.kitchenType ?? null,
  furnishedStatus: unit.furnishedStatus ?? null,
  rentAnnual: unit.rentAnnual?.toString() ?? null,
  paymentFrequency: unit.paymentFrequency ?? null,
  securityDepositAmount: unit.securityDepositAmount?.toString() ?? null,
  serviceChargePerUnit: unit.serviceChargePerUnit?.toString() ?? null,
  vatApplicable: unit.vatApplicable ?? null,
  electricityMeterNumber: unit.electricityMeterNumber ?? null,
  waterMeterNumber: unit.waterMeterNumber ?? null,
  gasMeterNumber: unit.gasMeterNumber ?? null,
  createdAt: unit.createdAt,
  updatedAt: unit.updatedAt,
  amenityIds: unit.amenities?.map((link) => link.amenityId) ?? [],
  amenities:
    unit.amenities?.map((link) => ({
      id: link.amenity.id,
      name: link.amenity.name,
    })) ?? [],
});

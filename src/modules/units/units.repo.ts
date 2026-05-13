import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  FurnishedStatus,
  KitchenType,
  MaintenancePayer,
  PaymentFrequency,
  Prisma,
  Unit,
  UnitSizeUnit,
} from '@prisma/client';

@Injectable()
export class UnitsRepo {
  constructor(private readonly prisma: PrismaService) {}

  create(
    buildingId: string,
    data: {
      label: string;
      floor?: number;
      notes?: string;
      unitTypeId?: string;
      ownerId?: string;
      maintenancePayer?: MaintenancePayer;
      unitSize?: Prisma.Decimal;
      unitSizeUnit?: UnitSizeUnit;
      bedrooms?: number;
      bathrooms?: number;
      balcony?: boolean;
      kitchenType?: KitchenType;
      furnishedStatus?: FurnishedStatus;
      rentAnnual?: Prisma.Decimal;
      paymentFrequency?: PaymentFrequency;
      securityDepositAmount?: Prisma.Decimal;
      serviceChargePerUnit?: Prisma.Decimal;
      vatApplicable?: boolean;
      electricityMeterNumber?: string;
      waterMeterNumber?: string;
      gasMeterNumber?: string;
    },
  ): Promise<Unit> {
    return this.prisma.unit.create({
      data: {
        buildingId,
        label: data.label,
        floor: data.floor,
        notes: data.notes,
        unitTypeId: data.unitTypeId,
        ownerId: data.ownerId,
        maintenancePayer: data.maintenancePayer,
        unitSize: data.unitSize,
        unitSizeUnit: data.unitSizeUnit,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        balcony: data.balcony,
        kitchenType: data.kitchenType,
        furnishedStatus: data.furnishedStatus,
        rentAnnual: data.rentAnnual,
        paymentFrequency: data.paymentFrequency,
        securityDepositAmount: data.securityDepositAmount,
        serviceChargePerUnit: data.serviceChargePerUnit,
        vatApplicable: data.vatApplicable,
        electricityMeterNumber: data.electricityMeterNumber,
        waterMeterNumber: data.waterMeterNumber,
        gasMeterNumber: data.gasMeterNumber,
      },
    });
  }

  listByBuilding(buildingId: string): Promise<Unit[]> {
    return this.listByBuildingWithAvailability(buildingId);
  }

  listByBuildingWithAvailability(
    buildingId: string,
    availableOnly?: boolean,
  ): Promise<Unit[]> {
    return this.prisma.unit.findMany({
      where: {
        buildingId,
        ...(availableOnly
          ? {
              occupancies: {
                none: { status: 'ACTIVE' },
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  countByBuilding(buildingId: string) {
    return this.prisma.unit.count({
      where: { buildingId },
    });
  }

  countVacantByBuilding(buildingId: string) {
    return this.prisma.unit.count({
      where: {
        buildingId,
        occupancies: {
          none: { status: 'ACTIVE' },
        },
      },
    });
  }

  findByIdForBuilding(
    buildingId: string,
    unitId: string,
  ): Promise<Unit | null> {
    return this.prisma.unit.findFirst({
      where: {
        id: unitId,
        buildingId,
      },
    });
  }

  findByIdForBuildingWithAmenities(
    buildingId: string,
    unitId: string,
  ): Promise<Unit | null> {
    return this.prisma.unit.findFirst({
      where: {
        id: unitId,
        buildingId,
      },
      include: {
        amenities: {
          include: {
            amenity: true,
          },
        },
      },
    });
  }

  update(unitId: string, data: Prisma.UnitUpdateInput): Promise<Unit> {
    return this.prisma.unit.update({
      where: { id: unitId },
      data,
    });
  }

  listByBuildingWithOccupancy(buildingId: string) {
    return this.prisma.unit.findMany({
      where: { buildingId },
      include: {
        building: true,
        unitType: true,
        occupancies: {
          where: { status: 'ACTIVE' },
          include: {
            residentUser: true,
            lease: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

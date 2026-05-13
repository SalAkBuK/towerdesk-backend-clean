import { Injectable } from '@nestjs/common';
import {
  ParkingAllocation,
  ParkingSlot,
  ParkingSlotType,
} from '@prisma/client';
import { DbClient } from '../../infra/prisma/db-client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class ParkingRepo {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: DbClient): DbClient {
    return tx ?? this.prisma;
  }

  create(
    orgId: string,
    buildingId: string,
    data: {
      code: string;
      level?: string | null;
      type: ParkingSlotType;
      isCovered?: boolean;
      isActive?: boolean;
    },
    tx?: DbClient,
  ): Promise<ParkingSlot> {
    const prisma = this.getClient(tx);
    return prisma.parkingSlot.create({
      data: {
        orgId,
        buildingId,
        code: data.code,
        level: data.level ?? null,
        type: data.type,
        isCovered: data.isCovered ?? false,
        isActive: data.isActive ?? true,
      },
    });
  }

  listByBuilding(
    orgId: string,
    buildingId: string,
    availableOnly?: boolean,
    tx?: DbClient,
  ): Promise<ParkingSlot[]> {
    const prisma = this.getClient(tx);
    return prisma.parkingSlot.findMany({
      where: {
        orgId,
        buildingId,
        ...(availableOnly
          ? {
              allocations: {
                none: {
                  endDate: null,
                },
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdForOrg(
    orgId: string,
    slotId: string,
    tx?: DbClient,
  ): Promise<ParkingSlot | null> {
    const prisma = this.getClient(tx);
    return prisma.parkingSlot.findFirst({
      where: { id: slotId, orgId },
    });
  }

  update(
    slotId: string,
    data: {
      code?: string;
      level?: string | null;
      type?: ParkingSlotType;
      isCovered?: boolean;
      isActive?: boolean;
    },
    tx?: DbClient,
  ): Promise<ParkingSlot> {
    const prisma = this.getClient(tx);
    return prisma.parkingSlot.update({
      where: { id: slotId },
      data,
    });
  }

  findManyByIds(
    orgId: string,
    buildingId: string,
    slotIds: string[],
    tx?: DbClient,
  ): Promise<ParkingSlot[]> {
    const prisma = this.getClient(tx);
    return prisma.parkingSlot.findMany({
      where: {
        id: { in: slotIds },
        orgId,
        buildingId,
        isActive: true,
      },
    });
  }

  findActiveAllocationsForSlots(
    slotIds: string[],
    tx?: DbClient,
  ): Promise<ParkingAllocation[]> {
    const prisma = this.getClient(tx);
    if (slotIds.length === 0) {
      return Promise.resolve([]);
    }
    return prisma.parkingAllocation.findMany({
      where: {
        parkingSlotId: { in: slotIds },
        endDate: null,
      },
    });
  }

  findAvailableSlots(
    orgId: string,
    buildingId: string,
    take: number,
    tx?: DbClient,
  ): Promise<ParkingSlot[]> {
    const prisma = this.getClient(tx);
    return prisma.parkingSlot.findMany({
      where: {
        orgId,
        buildingId,
        isActive: true,
        allocations: {
          none: { endDate: null },
        },
      },
      orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
      take,
    });
  }

  createAllocations(
    orgId: string,
    buildingId: string,
    target: { occupancyId: string } | { unitId: string },
    slotIds: string[],
    tx?: DbClient,
  ): Promise<(ParkingAllocation & { parkingSlot: ParkingSlot })[]> {
    const prisma = this.getClient(tx);
    const now = new Date();
    const targetWhere =
      'occupancyId' in target
        ? { occupancyId: target.occupancyId }
        : { unitId: target.unitId };
    return prisma.parkingAllocation
      .createMany({
        data: slotIds.map((slotId) => ({
          orgId,
          buildingId,
          parkingSlotId: slotId,
          ...targetWhere,
          startDate: now,
          endDate: null,
        })),
        skipDuplicates: false,
      })
      .then(async () => {
        return prisma.parkingAllocation.findMany({
          where: {
            orgId,
            buildingId,
            ...targetWhere,
            parkingSlotId: { in: slotIds },
            startDate: now,
          },
          include: {
            parkingSlot: true,
          },
        });
      });
  }

  findAllocationByIdForOrg(
    orgId: string,
    allocationId: string,
    tx?: DbClient,
  ): Promise<(ParkingAllocation & { parkingSlot: ParkingSlot }) | null> {
    const prisma = this.getClient(tx);
    return prisma.parkingAllocation.findFirst({
      where: { id: allocationId, orgId },
      include: { parkingSlot: true },
    });
  }

  endAllocation(
    allocationId: string,
    endDate: Date,
    tx?: DbClient,
  ): Promise<ParkingAllocation> {
    const prisma = this.getClient(tx);
    return prisma.parkingAllocation.update({
      where: { id: allocationId },
      data: { endDate },
    });
  }

  endAllActiveForOccupancy(
    orgId: string,
    occupancyId: string,
    endDate: Date,
    tx?: DbClient,
  ): Promise<{ count: number }> {
    const prisma = this.getClient(tx);
    return prisma.parkingAllocation.updateMany({
      where: { orgId, occupancyId, endDate: null },
      data: { endDate },
    });
  }

  endAllActiveForUnit(
    orgId: string,
    unitId: string,
    endDate: Date,
    tx?: DbClient,
  ): Promise<{ count: number }> {
    const prisma = this.getClient(tx);
    return prisma.parkingAllocation.updateMany({
      where: { orgId, unitId, endDate: null },
      data: { endDate },
    });
  }

  listAllocationsForOccupancy(
    orgId: string,
    occupancyId: string,
    activeOnly?: boolean,
    tx?: DbClient,
  ): Promise<(ParkingAllocation & { parkingSlot: ParkingSlot })[]> {
    const prisma = this.getClient(tx);
    return prisma.parkingAllocation.findMany({
      where: {
        orgId,
        occupancyId,
        ...(activeOnly ? { endDate: null } : {}),
      },
      include: {
        parkingSlot: true,
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  listAllocationsForUnit(
    orgId: string,
    unitId: string,
    activeOnly?: boolean,
    tx?: DbClient,
  ): Promise<(ParkingAllocation & { parkingSlot: ParkingSlot })[]> {
    const prisma = this.getClient(tx);
    return prisma.parkingAllocation.findMany({
      where: {
        orgId,
        unitId,
        ...(activeOnly ? { endDate: null } : {}),
      },
      include: {
        parkingSlot: true,
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // Vehicle methods
  createVehicle(
    orgId: string,
    occupancyId: string,
    data: {
      plateNumber: string;
      label?: string;
    },
    tx?: DbClient,
  ) {
    const prisma = this.getClient(tx);
    return prisma.vehicle.create({
      data: {
        orgId,
        occupancyId,
        plateNumber: data.plateNumber,
        label: data.label ?? null,
      },
    });
  }

  listVehiclesForOccupancy(orgId: string, occupancyId: string, tx?: DbClient) {
    const prisma = this.getClient(tx);
    return prisma.vehicle.findMany({
      where: {
        orgId,
        occupancyId,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findVehicleByIdForOrg(orgId: string, vehicleId: string, tx?: DbClient) {
    const prisma = this.getClient(tx);
    return prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        orgId,
      },
    });
  }

  updateVehicle(
    vehicleId: string,
    data: {
      plateNumber?: string;
      label?: string | null;
    },
    tx?: DbClient,
  ) {
    const prisma = this.getClient(tx);
    return prisma.vehicle.update({
      where: { id: vehicleId },
      data,
    });
  }

  deleteVehicle(vehicleId: string, tx?: DbClient) {
    const prisma = this.getClient(tx);
    return prisma.vehicle.delete({
      where: { id: vehicleId },
    });
  }
}

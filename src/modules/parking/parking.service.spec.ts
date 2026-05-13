import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { UnitsRepo } from '../units/units.repo';
import { ParkingRepo } from './parking.repo';
import { ParkingService } from './parking.service';

describe('ParkingService (resident self-service)', () => {
  let prisma: PrismaService;
  let parkingRepo: jest.Mocked<ParkingRepo>;
  let service: ParkingService;
  let occupancyFindFirstMock: jest.Mock;

  beforeEach(() => {
    occupancyFindFirstMock = jest.fn();

    prisma = {
      occupancy: {
        findFirst: occupancyFindFirstMock,
      },
    } as unknown as PrismaService;

    parkingRepo = {
      listAllocationsForOccupancy: jest.fn(),
    } as unknown as jest.Mocked<ParkingRepo>;

    service = new ParkingService(
      parkingRepo,
      {} as BuildingsRepo,
      {} as UnitsRepo,
      prisma,
    );
  });

  it('returns null when resident has no active occupancy', async () => {
    occupancyFindFirstMock.mockResolvedValue(null);

    const result = await service.getActiveAllocationForResident({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result).toBeNull();
    expect(parkingRepo.listAllocationsForOccupancy).not.toHaveBeenCalled();
  });

  it('returns null when resident has no active parking allocation', async () => {
    occupancyFindFirstMock.mockResolvedValue({
      id: 'occ-1',
    } as never);
    parkingRepo.listAllocationsForOccupancy.mockResolvedValue([]);

    const result = await service.getActiveAllocationForResident({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result).toBeNull();
    expect(parkingRepo.listAllocationsForOccupancy).toHaveBeenCalledWith(
      'org-1',
      'occ-1',
      true,
    );
  });

  it('returns the latest active parking allocation', async () => {
    occupancyFindFirstMock.mockResolvedValue({
      id: 'occ-1',
    } as never);
    parkingRepo.listAllocationsForOccupancy.mockResolvedValue([
      { id: 'alloc-1' } as never,
      { id: 'alloc-2' } as never,
    ]);

    const result = await service.getActiveAllocationForResident({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result).toEqual({ id: 'alloc-1' });
  });
});

describe('ParkingService (lease context constraints)', () => {
  let prisma: PrismaService;
  let parkingRepo: jest.Mocked<ParkingRepo>;
  let buildingsRepo: jest.Mocked<BuildingsRepo>;
  let service: ParkingService;
  let tx: {
    occupancy: { findFirst: jest.Mock };
    lease: { findFirst: jest.Mock };
    leaseActivity: { create: jest.Mock };
  };

  beforeEach(() => {
    tx = {
      occupancy: { findFirst: jest.fn() },
      lease: { findFirst: jest.fn() },
      leaseActivity: { create: jest.fn() },
    };

    prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;

    parkingRepo = {
      createVehicle: jest.fn(),
      endAllActiveForOccupancy: jest.fn(),
    } as unknown as jest.Mocked<ParkingRepo>;

    buildingsRepo = {} as jest.Mocked<BuildingsRepo>;

    service = new ParkingService(
      parkingRepo,
      buildingsRepo,
      {} as UnitsRepo,
      prisma,
    );
  });

  it('blocks createVehicle when occupancy is not active', async () => {
    tx.occupancy.findFirst.mockResolvedValue({
      id: 'occ-1',
      buildingId: 'building-1',
      status: 'ENDED',
    } as never);

    await expect(
      service.createVehicle({ sub: 'user-1', orgId: 'org-1' }, 'occ-1', {
        plateNumber: 'ABC-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(parkingRepo.createVehicle).not.toHaveBeenCalled();
  });

  it('emits VEHICLE_ADDED lease activity on vehicle create', async () => {
    tx.occupancy.findFirst.mockResolvedValue({
      id: 'occ-1',
      buildingId: 'building-1',
      status: 'ACTIVE',
    } as never);
    tx.lease.findFirst.mockResolvedValue({ id: 'lease-1' } as never);
    parkingRepo.createVehicle.mockResolvedValue({
      id: 'vehicle-1',
      orgId: 'org-1',
      occupancyId: 'occ-1',
      plateNumber: 'ABC-123',
      label: 'Blue sedan',
      createdAt: new Date('2026-03-03T10:00:00.000Z'),
    } as never);

    const vehicle = await service.createVehicle(
      { sub: 'user-1', orgId: 'org-1' },
      'occ-1',
      { plateNumber: 'ABC-123', label: 'Blue sedan' },
    );

    expect(vehicle.id).toBe('vehicle-1');
    expect(tx.leaseActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          leaseId: 'lease-1',
          action: 'VEHICLE_ADDED',
          changedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('blocks endAllForOccupancy when active lease is missing', async () => {
    tx.occupancy.findFirst.mockResolvedValue({
      id: 'occ-1',
      buildingId: 'building-1',
      status: 'ACTIVE',
    } as never);
    tx.lease.findFirst.mockResolvedValue(null);

    await expect(
      service.endAllForOccupancy(
        { sub: 'user-1', orgId: 'org-1' },
        'occ-1',
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(parkingRepo.endAllActiveForOccupancy).not.toHaveBeenCalled();
  });

  it('emits PARKING_ALLOCATION_ENDED for occupancy end-all', async () => {
    tx.occupancy.findFirst.mockResolvedValue({
      id: 'occ-1',
      buildingId: 'building-1',
      status: 'ACTIVE',
    } as never);
    tx.lease.findFirst.mockResolvedValue({ id: 'lease-1' } as never);
    parkingRepo.endAllActiveForOccupancy.mockResolvedValue({ count: 2 });

    const result = await service.endAllForOccupancy(
      { sub: 'admin-1', orgId: 'org-1' },
      'occ-1',
      {},
    );

    expect(result).toEqual({ ended: 2 });
    expect(tx.leaseActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          leaseId: 'lease-1',
          action: 'PARKING_ALLOCATION_ENDED',
          changedByUserId: 'admin-1',
        }),
      }),
    );
  });
});

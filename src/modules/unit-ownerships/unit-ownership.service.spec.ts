import { PrismaService } from '../../infra/prisma/prisma.service';
import { UnitOwnershipService } from './unit-ownership.service';

describe('UnitOwnershipService', () => {
  let prisma: {
    unitOwnership: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
  };
  let service: UnitOwnershipService;

  beforeEach(() => {
    prisma = {
      unitOwnership: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new UnitOwnershipService(prisma as unknown as PrismaService);
  });

  it('creates an active ownership row when a unit gets an owner for the first time', async () => {
    prisma.unitOwnership.findMany.mockResolvedValue([]);
    prisma.unitOwnership.create.mockResolvedValue({ id: 'uo-1' });

    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-1',
      ownerId: 'owner-1',
    });

    expect(prisma.unitOwnership.updateMany).not.toHaveBeenCalled();
    expect(prisma.unitOwnership.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org-1',
        unitId: 'unit-1',
        ownerId: 'owner-1',
        startDate: expect.any(Date),
        endDate: null,
        isPrimary: true,
      },
    });
  });

  it('closes active ownership rows when a unit no longer has an owner pointer', async () => {
    prisma.unitOwnership.findMany.mockResolvedValue([
      { id: 'uo-1', ownerId: 'owner-1', endDate: null },
    ]);
    prisma.unitOwnership.updateMany.mockResolvedValue({ count: 1 });

    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-1',
      ownerId: null,
    });

    expect(prisma.unitOwnership.updateMany).toHaveBeenCalledWith({
      where: {
        unitId: 'unit-1',
        endDate: null,
      },
      data: {
        endDate: expect.any(Date),
      },
    });
    expect(prisma.unitOwnership.create).not.toHaveBeenCalled();
  });

  it('does nothing when the single active ownership row already matches the unit owner pointer', async () => {
    prisma.unitOwnership.findMany.mockResolvedValue([
      { id: 'uo-1', ownerId: 'owner-1', endDate: null },
    ]);

    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-1',
      ownerId: 'owner-1',
    });

    expect(prisma.unitOwnership.updateMany).not.toHaveBeenCalled();
    expect(prisma.unitOwnership.create).not.toHaveBeenCalled();
  });

  it('closes previous active rows and opens a new one when the owner pointer changes', async () => {
    prisma.unitOwnership.findMany.mockResolvedValue([
      { id: 'uo-1', ownerId: 'owner-1', endDate: null },
      { id: 'uo-2', ownerId: 'owner-3', endDate: null },
    ]);
    prisma.unitOwnership.updateMany.mockResolvedValue({ count: 2 });
    prisma.unitOwnership.create.mockResolvedValue({ id: 'uo-3' });

    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-1',
      ownerId: 'owner-2',
    });

    expect(prisma.unitOwnership.updateMany).toHaveBeenCalledWith({
      where: {
        unitId: 'unit-1',
        endDate: null,
        ownerId: { not: 'owner-2' },
      },
      data: {
        endDate: expect.any(Date),
      },
    });
    expect(prisma.unitOwnership.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org-1',
        unitId: 'unit-1',
        ownerId: 'owner-2',
        startDate: expect.any(Date),
        endDate: null,
        isPrimary: true,
      },
    });
  });

  it('uses the transaction client when provided, preserving dual-write consistency', async () => {
    const tx = {
      unitOwnership: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'uo-tx-1' }),
      },
    };

    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-1',
      ownerId: 'owner-1',
      tx: tx as never,
    });

    expect(tx.unitOwnership.findMany).toHaveBeenCalledWith({
      where: {
        unitId: 'unit-1',
        endDate: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(tx.unitOwnership.create).toHaveBeenCalled();
    expect(prisma.unitOwnership.create).not.toHaveBeenCalled();
  });
});

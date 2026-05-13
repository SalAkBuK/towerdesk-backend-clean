import { PrismaService } from '../../infra/prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    building: { findMany: jest.Mock };
    unit: { groupBy: jest.Mock };
    occupancy: { groupBy: jest.Mock };
    lease: { groupBy: jest.Mock; findMany: jest.Mock };
    maintenanceRequest: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    parkingSlot: { groupBy: jest.Mock };
    parkingAllocation: { groupBy: jest.Mock; findMany: jest.Mock };
    visitor: { findMany: jest.Mock; count: jest.Mock };
    broadcast: { findMany: jest.Mock };
    notification: { count: jest.Mock };
  };

  let dashboardService: DashboardService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-03T12:00:00.000Z'));

    prisma = {
      $queryRaw: jest.fn(),
      building: { findMany: jest.fn() },
      unit: { groupBy: jest.fn() },
      occupancy: { groupBy: jest.fn() },
      lease: { groupBy: jest.fn(), findMany: jest.fn() },
      maintenanceRequest: {
        groupBy: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      parkingSlot: { groupBy: jest.fn() },
      parkingAllocation: { groupBy: jest.fn(), findMany: jest.fn() },
      visitor: { findMany: jest.fn(), count: jest.fn() },
      broadcast: { findMany: jest.fn() },
      notification: { count: jest.fn() },
    };

    dashboardService = new DashboardService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds org overview metrics and trends', async () => {
    prisma.building.findMany.mockResolvedValue([
      { id: 'b-1', name: 'Alpha Tower' },
      { id: 'b-2', name: 'Beta Tower' },
    ]);
    prisma.unit.groupBy.mockResolvedValue([
      { buildingId: 'b-1', _count: { _all: 10 } },
      { buildingId: 'b-2', _count: { _all: 6 } },
    ]);
    prisma.occupancy.groupBy.mockResolvedValue([
      { buildingId: 'b-1', _count: { _all: 7 } },
      { buildingId: 'b-2', _count: { _all: 4 } },
    ]);
    prisma.lease.groupBy.mockResolvedValue([
      { buildingId: 'b-1', _count: { _all: 7 } },
      { buildingId: 'b-2', _count: { _all: 4 } },
    ]);
    prisma.maintenanceRequest.groupBy.mockResolvedValue([
      { buildingId: 'b-1', _count: { _all: 2 } },
      { buildingId: 'b-2', _count: { _all: 1 } },
    ]);
    prisma.parkingSlot.groupBy.mockResolvedValue([
      { buildingId: 'b-1', _count: { _all: 8 } },
      { buildingId: 'b-2', _count: { _all: 5 } },
    ]);
    prisma.parkingAllocation.groupBy.mockResolvedValue([
      { buildingId: 'b-1', _count: { _all: 6 } },
      { buildingId: 'b-2', _count: { _all: 3 } },
    ]);
    prisma.visitor.count.mockResolvedValue(1);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ date: '2026-04-02', count: 1 }])
      .mockResolvedValueOnce([{ date: '2026-04-03', count: 1 }])
      .mockResolvedValueOnce([{ date: '2026-04-03', count: 1 }])
      .mockResolvedValueOnce([
        { date: '2026-04-01', sent: 1, recipientCount: 15 },
      ]);
    prisma.maintenanceRequest.count.mockResolvedValue(1);
    prisma.notification.count.mockResolvedValue(3);

    const result = await dashboardService.getOverview({
      sub: 'user-1',
      orgId: 'org-1',
    });

    expect(result.summary).toMatchObject({
      buildingsTotal: 2,
      unitsTotal: 16,
      occupiedUnits: 11,
      vacantUnits: 5,
      activeLeases: 11,
      openMaintenanceRequests: 3,
      overdueMaintenanceRequests: 1,
      visitorsToday: 1,
      activeParkingAllocations: 9,
      broadcastsLast30Days: 1,
      unreadNotifications: 3,
    });
    expect(result.summary.occupancyRate).toBe(68.75);
    expect(result.buildings).toHaveLength(2);
    expect(result.buildings[0]).toMatchObject({
      buildingId: 'b-1',
      totalUnits: 10,
      occupiedUnits: 7,
      activeParkingAllocations: 6,
      parkingSlotsTotal: 8,
    });
    expect(result.trends.maintenance.some((point) => point.created === 1)).toBe(
      true,
    );
    expect(result.trends.broadcasts.some((point) => point.sent === 1)).toBe(
      true,
    );
  });

  it('merges recent activity in descending order', async () => {
    prisma.maintenanceRequest.findMany
      .mockResolvedValueOnce([
        {
          id: 'r-1',
          title: 'Lobby light outage',
          status: 'COMPLETED',
          createdAt: new Date('2026-04-03T08:00:00.000Z'),
          completedAt: new Date('2026-04-03T10:00:00.000Z'),
          canceledAt: null,
          buildingId: 'b-1',
          building: { name: 'Alpha Tower' },
          unit: { label: '101' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'r-1',
          title: 'Lobby light outage',
          status: 'COMPLETED',
          createdAt: new Date('2026-04-03T08:00:00.000Z'),
          completedAt: new Date('2026-04-03T10:00:00.000Z'),
          canceledAt: null,
          buildingId: 'b-1',
          building: { name: 'Alpha Tower' },
          unit: { label: '101' },
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.visitor.findMany.mockResolvedValue([
      {
        id: 'v-1',
        visitorName: 'John Doe',
        type: 'GUEST_VISITOR',
        status: 'ARRIVED',
        createdAt: new Date('2026-04-03T09:30:00.000Z'),
        buildingId: 'b-1',
        building: { name: 'Alpha Tower' },
        unit: { label: '101' },
      },
    ]);
    prisma.broadcast.findMany.mockResolvedValue([
      {
        id: 'br-1',
        title: 'Water shutdown notice',
        createdAt: new Date('2026-04-03T11:00:00.000Z'),
        recipientCount: 100,
        buildingIds: ['b-1'],
      },
    ]);
    prisma.parkingAllocation.findMany
      .mockResolvedValueOnce([
        {
          id: 'p-1',
          createdAt: new Date('2026-04-03T07:00:00.000Z'),
          endDate: new Date('2026-04-03T11:30:00.000Z'),
          buildingId: 'b-1',
          building: { name: 'Alpha Tower' },
          parkingSlot: { code: 'A-12', type: 'CAR' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'p-1',
          createdAt: new Date('2026-04-03T07:00:00.000Z'),
          endDate: new Date('2026-04-03T11:30:00.000Z'),
          buildingId: 'b-1',
          building: { name: 'Alpha Tower' },
          parkingSlot: { code: 'A-12', type: 'CAR' },
        },
      ]);
    prisma.lease.findMany.mockResolvedValue([
      {
        id: 'l-1',
        createdAt: new Date('2026-04-03T06:00:00.000Z'),
        status: 'ACTIVE',
        buildingId: 'b-1',
        building: { name: 'Alpha Tower' },
        unit: { label: '101' },
      },
    ]);

    const result = await dashboardService.getActivity(
      { sub: 'user-1', orgId: 'org-1' },
      10,
    );

    expect(result.items.map((item) => item.type)).toEqual([
      'parking.ended',
      'broadcast.created',
      'maintenance.completed',
      'visitor.created',
      'maintenance.created',
      'parking.allocated',
      'lease.created',
    ]);

    expect(prisma.maintenanceRequest.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    );
    expect(prisma.maintenanceRequest.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: { completedAt: 'desc' },
        take: 10,
      }),
    );
    expect(prisma.parkingAllocation.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: { endDate: 'desc' },
        take: 10,
      }),
    );
    expect(prisma.visitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    );
  });
});

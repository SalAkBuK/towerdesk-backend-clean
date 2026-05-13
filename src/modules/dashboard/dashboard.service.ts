import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  DASHBOARD_ACTIVITY_DAYS,
  DASHBOARD_ACTIVITY_LIMIT,
  DASHBOARD_MAINTENANCE_OVERDUE_HOURS,
  DASHBOARD_TREND_DAYS,
} from './dashboard.constants';
import {
  DashboardActivityItemDto,
  DashboardActivityResponseDto,
} from './dto/dashboard-activity.response.dto';
import {
  DashboardBroadcastTrendPointDto,
  DashboardBuildingMetricDto,
  DashboardMaintenanceTrendPointDto,
  DashboardOverviewResponseDto,
  DashboardSummaryDto,
  DashboardTrendsDto,
  DashboardVisitorTrendPointDto,
} from './dto/dashboard-overview.response.dto';

type DailyCountRow = {
  date: string;
  count: number | bigint;
};

type BroadcastDailyCountRow = {
  date: string;
  sent: number | bigint;
  recipientCount: number | bigint;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    user: AuthenticatedUser | undefined,
  ): Promise<DashboardOverviewResponseDto> {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const now = new Date();
    const trendStart = this.startOfDay(new Date(now));
    trendStart.setDate(trendStart.getDate() - (DASHBOARD_TREND_DAYS - 1));
    const overdueBefore = new Date(
      now.getTime() - DASHBOARD_MAINTENANCE_OVERDUE_HOURS * 60 * 60 * 1000,
    );
    const todayStart = this.startOfDay(new Date(now));

    const buildings = await this.prisma.building.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const buildingIds = buildings.map((building) => building.id);

    if (buildingIds.length === 0) {
      return {
        generatedAt: now,
        summary: this.zeroSummary(),
        trends: this.emptyTrends(trendStart),
        buildings: [],
      };
    }

    const [
      unitRows,
      occupancyRows,
      leaseRows,
      openRequestRows,
      parkingSlotRows,
      activeParkingRows,
      visitorCountToday,
      maintenanceCreatedTrendRows,
      maintenanceCompletedTrendRows,
      visitorTrendRows,
      broadcastTrendRows,
      overdueMaintenanceRequests,
      unreadNotifications,
    ] = await Promise.all([
      this.prisma.unit.groupBy({
        by: ['buildingId'],
        where: { buildingId: { in: buildingIds } },
        _count: { _all: true },
      }),
      this.prisma.occupancy.groupBy({
        by: ['buildingId'],
        where: {
          buildingId: { in: buildingIds },
          status: 'ACTIVE',
        },
        _count: { _all: true },
      }),
      this.prisma.lease.groupBy({
        by: ['buildingId'],
        where: { orgId, buildingId: { in: buildingIds }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.maintenanceRequest.groupBy({
        by: ['buildingId'],
        where: {
          orgId,
          buildingId: { in: buildingIds },
          status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
        },
        _count: { _all: true },
      }),
      this.prisma.parkingSlot.groupBy({
        by: ['buildingId'],
        where: { orgId, buildingId: { in: buildingIds } },
        _count: { _all: true },
      }),
      this.prisma.parkingAllocation.groupBy({
        by: ['buildingId'],
        where: {
          orgId,
          buildingId: { in: buildingIds },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        _count: { _all: true },
      }),
      this.prisma.visitor.count({
        where: {
          orgId,
          createdAt: { gte: todayStart },
        },
      }),
      this.listMaintenanceTrendCounts(orgId, trendStart, 'createdAt'),
      this.listMaintenanceTrendCounts(orgId, trendStart, 'completedAt'),
      this.listVisitorTrendCounts(orgId, trendStart),
      this.listBroadcastTrendCounts(orgId, trendStart),
      this.prisma.maintenanceRequest.count({
        where: {
          orgId,
          buildingId: { in: buildingIds },
          status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
          createdAt: { lte: overdueBefore },
        },
      }),
      this.prisma.notification.count({
        where: { orgId, recipientUserId: userId, readAt: null },
      }),
    ]);

    const unitByBuilding = this.countByBuilding(unitRows);
    const occupancyByBuilding = this.countByBuilding(occupancyRows);
    const activeLeasesByBuilding = this.countByBuilding(leaseRows);
    const openRequestsByBuilding = this.countByBuilding(openRequestRows);
    const parkingSlotsByBuilding = this.countByBuilding(parkingSlotRows);
    const activeParkingByBuilding = this.countByBuilding(activeParkingRows);

    const summary = this.buildSummary({
      buildings: buildings.length,
      unitRows,
      occupancyRows,
      leaseRows,
      openRequestRows,
      visitorCountToday,
      activeParkingRows,
      broadcastsLast30Days: this.sumDailyCounts(
        broadcastTrendRows.map((row) => row.sent),
      ),
      unreadNotifications,
      overdueMaintenanceRequests,
    });

    const trends = this.buildTrends(
      trendStart,
      maintenanceCreatedTrendRows,
      maintenanceCompletedTrendRows,
      visitorTrendRows,
      broadcastTrendRows,
    );

    const buildingMetrics = buildings.map<DashboardBuildingMetricDto>(
      (building) => {
        const totalUnits = unitByBuilding.get(building.id) ?? 0;
        const occupiedUnits = occupancyByBuilding.get(building.id) ?? 0;
        const activeLeases = activeLeasesByBuilding.get(building.id) ?? 0;
        const openMaintenanceRequests =
          openRequestsByBuilding.get(building.id) ?? 0;
        const activeParkingAllocations =
          activeParkingByBuilding.get(building.id) ?? 0;
        const parkingSlotsTotal = parkingSlotsByBuilding.get(building.id) ?? 0;
        const vacantUnits = Math.max(totalUnits - occupiedUnits, 0);
        const occupancyRate = this.percentage(occupiedUnits, totalUnits);

        return {
          buildingId: building.id,
          buildingName: building.name,
          totalUnits,
          occupiedUnits,
          vacantUnits,
          occupancyRate,
          activeLeases,
          openMaintenanceRequests,
          activeParkingAllocations,
          parkingSlotsTotal,
        };
      },
    );

    return {
      generatedAt: now,
      summary,
      trends,
      buildings: buildingMetrics,
    };
  }

  async getActivity(
    user: AuthenticatedUser | undefined,
    limit = DASHBOARD_ACTIVITY_LIMIT,
  ): Promise<DashboardActivityResponseDto> {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const now = new Date();
    const activityStart = new Date(now);
    activityStart.setDate(activityStart.getDate() - DASHBOARD_ACTIVITY_DAYS);

    const maintenanceActivitySelect = {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      completedAt: true,
      canceledAt: true,
      buildingId: true,
      building: { select: { name: true } },
      unit: { select: { label: true } },
    } as const;

    const parkingActivitySelect = {
      id: true,
      createdAt: true,
      endDate: true,
      buildingId: true,
      building: { select: { name: true } },
      parkingSlot: { select: { code: true, type: true } },
    } as const;

    const [
      maintenanceCreatedRequests,
      maintenanceCompletedRequests,
      maintenanceCanceledRequests,
      visitors,
      broadcasts,
      parkingAllocationsCreated,
      parkingAllocationsEnded,
      leases,
    ] = await Promise.all([
      this.prisma.maintenanceRequest.findMany({
        where: {
          orgId,
          createdAt: { gte: activityStart },
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        select: maintenanceActivitySelect,
      }),
      this.prisma.maintenanceRequest.findMany({
        where: {
          orgId,
          completedAt: { gte: activityStart },
        },
        orderBy: { completedAt: 'desc' },
        take: safeLimit,
        select: maintenanceActivitySelect,
      }),
      this.prisma.maintenanceRequest.findMany({
        where: {
          orgId,
          canceledAt: { gte: activityStart },
        },
        orderBy: { canceledAt: 'desc' },
        take: safeLimit,
        select: maintenanceActivitySelect,
      }),
      this.prisma.visitor.findMany({
        where: { orgId, createdAt: { gte: activityStart } },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        select: {
          id: true,
          visitorName: true,
          type: true,
          status: true,
          createdAt: true,
          buildingId: true,
          building: { select: { name: true } },
          unit: { select: { label: true } },
        },
      }),
      this.prisma.broadcast.findMany({
        where: { orgId, createdAt: { gte: activityStart } },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        select: {
          id: true,
          title: true,
          createdAt: true,
          recipientCount: true,
          buildingIds: true,
        },
      }),
      this.prisma.parkingAllocation.findMany({
        where: {
          orgId,
          createdAt: { gte: activityStart },
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        select: parkingActivitySelect,
      }),
      this.prisma.parkingAllocation.findMany({
        where: {
          orgId,
          endDate: { gte: activityStart },
        },
        orderBy: { endDate: 'desc' },
        take: safeLimit,
        select: parkingActivitySelect,
      }),
      this.prisma.lease.findMany({
        where: { orgId, createdAt: { gte: activityStart } },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        select: {
          id: true,
          createdAt: true,
          status: true,
          buildingId: true,
          building: { select: { name: true } },
          unit: { select: { label: true } },
        },
      }),
    ]);

    const items = [
      ...maintenanceCreatedRequests.map<DashboardActivityItemDto>(
        (request) => ({
          type: 'maintenance.created',
          title: `Maintenance request created: ${request.title}`,
          description: this.formatLocation(
            request.building?.name,
            request.unit?.label,
          ),
          entityType: 'maintenance_request',
          entityId: request.id,
          buildingId: request.buildingId,
          buildingName: request.building?.name ?? null,
          occurredAt: request.createdAt,
          metadata: { status: request.status },
        }),
      ),
      ...maintenanceCompletedRequests.map<DashboardActivityItemDto>(
        (request) => ({
          type: 'maintenance.completed',
          title: `Maintenance request completed: ${request.title}`,
          description: this.formatLocation(
            request.building?.name,
            request.unit?.label,
          ),
          entityType: 'maintenance_request',
          entityId: request.id,
          buildingId: request.buildingId,
          buildingName: request.building?.name ?? null,
          occurredAt: request.completedAt as Date,
          metadata: { status: request.status },
        }),
      ),
      ...maintenanceCanceledRequests.map<DashboardActivityItemDto>(
        (request) => ({
          type: 'maintenance.canceled',
          title: `Maintenance request canceled: ${request.title}`,
          description: this.formatLocation(
            request.building?.name,
            request.unit?.label,
          ),
          entityType: 'maintenance_request',
          entityId: request.id,
          buildingId: request.buildingId,
          buildingName: request.building?.name ?? null,
          occurredAt: request.canceledAt as Date,
          metadata: { status: request.status },
        }),
      ),
      ...visitors.map<DashboardActivityItemDto>((visitor) => ({
        type: 'visitor.created',
        title: `Visitor registered: ${visitor.visitorName}`,
        description: this.formatLocation(
          visitor.building?.name,
          visitor.unit?.label,
        ),
        entityType: 'visitor',
        entityId: visitor.id,
        buildingId: visitor.buildingId,
        buildingName: visitor.building?.name ?? null,
        occurredAt: visitor.createdAt,
        metadata: {
          status: visitor.status,
          visitorType: visitor.type,
        },
      })),
      ...broadcasts.map<DashboardActivityItemDto>((broadcast) => ({
        type: 'broadcast.created',
        title: `Broadcast sent: ${broadcast.title}`,
        description: `Recipients: ${broadcast.recipientCount}`,
        entityType: 'broadcast',
        entityId: broadcast.id,
        occurredAt: broadcast.createdAt,
        metadata: {
          recipientCount: broadcast.recipientCount,
          buildingIds: broadcast.buildingIds,
        },
      })),
      ...parkingAllocationsCreated.map<DashboardActivityItemDto>(
        (allocation) => ({
          type: 'parking.allocated',
          title: `Parking allocation created: ${allocation.parkingSlot.code}`,
          description: allocation.building?.name ?? null,
          entityType: 'parking_allocation',
          entityId: allocation.id,
          buildingId: allocation.buildingId,
          buildingName: allocation.building?.name ?? null,
          occurredAt: allocation.createdAt,
          metadata: {
            slotCode: allocation.parkingSlot.code,
            slotType: allocation.parkingSlot.type,
          },
        }),
      ),
      ...parkingAllocationsEnded
        .filter((allocation) => Boolean(allocation.endDate))
        .map<DashboardActivityItemDto>((allocation) => ({
          type: 'parking.ended',
          title: `Parking allocation ended: ${allocation.parkingSlot.code}`,
          description: allocation.building?.name ?? null,
          entityType: 'parking_allocation',
          entityId: allocation.id,
          buildingId: allocation.buildingId,
          buildingName: allocation.building?.name ?? null,
          occurredAt: allocation.endDate as Date,
          metadata: {
            slotCode: allocation.parkingSlot.code,
            slotType: allocation.parkingSlot.type,
          },
        })),
      ...leases.map<DashboardActivityItemDto>((lease) => ({
        type: 'lease.created',
        title: 'Lease created',
        description: this.formatLocation(
          lease.building?.name,
          lease.unit?.label,
        ),
        entityType: 'lease',
        entityId: lease.id,
        buildingId: lease.buildingId,
        buildingName: lease.building?.name ?? null,
        occurredAt: lease.createdAt,
        metadata: { status: lease.status },
      })),
    ]
      .sort(
        (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
      )
      .slice(0, safeLimit);

    return { items, nextCursor: null };
  }

  private buildSummary(input: {
    buildings: number;
    unitRows: { _count: { _all: number } }[];
    occupancyRows: { _count: { _all: number } }[];
    leaseRows: { _count: { _all: number } }[];
    openRequestRows: { _count: { _all: number } }[];
    visitorCountToday: number;
    activeParkingRows: { _count: { _all: number } }[];
    broadcastsLast30Days: number;
    unreadNotifications: number;
    overdueMaintenanceRequests: number;
  }): DashboardSummaryDto {
    const unitsTotal = this.sumCounts(input.unitRows);
    const occupiedUnits = this.sumCounts(input.occupancyRows);
    const vacantUnits = Math.max(unitsTotal - occupiedUnits, 0);
    const activeLeases = this.sumCounts(input.leaseRows);
    const openMaintenanceRequests = this.sumCounts(input.openRequestRows);
    const activeParkingAllocations = this.sumCounts(input.activeParkingRows);

    return {
      buildingsTotal: input.buildings,
      unitsTotal,
      occupiedUnits,
      vacantUnits,
      occupancyRate: this.percentage(occupiedUnits, unitsTotal),
      activeLeases,
      openMaintenanceRequests,
      overdueMaintenanceRequests: input.overdueMaintenanceRequests,
      visitorsToday: input.visitorCountToday,
      activeParkingAllocations,
      broadcastsLast30Days: input.broadcastsLast30Days,
      unreadNotifications: input.unreadNotifications,
    };
  }

  private buildTrends(
    start: Date,
    maintenanceCreatedRows: DailyCountRow[],
    maintenanceCompletedRows: DailyCountRow[],
    visitorRows: DailyCountRow[],
    broadcastRows: BroadcastDailyCountRow[],
  ): DashboardTrendsDto {
    const maintenanceCreated = this.toDailyCountMap(maintenanceCreatedRows);
    const maintenanceCompleted = this.toDailyCountMap(maintenanceCompletedRows);
    const visitorCreated = this.toDailyCountMap(visitorRows);
    const broadcastSent = this.toDailyCountMap(
      broadcastRows.map((row) => ({ date: row.date, count: row.sent })),
    );
    const broadcastRecipients = this.toDailyCountMap(
      broadcastRows.map((row) => ({
        date: row.date,
        count: row.recipientCount,
      })),
    );

    return {
      maintenance: this.toMaintenanceTrend(
        start,
        maintenanceCreated,
        maintenanceCompleted,
      ),
      visitors: this.toVisitorTrend(start, visitorCreated),
      broadcasts: this.toBroadcastTrend(
        start,
        broadcastSent,
        broadcastRecipients,
      ),
    };
  }

  private toMaintenanceTrend(
    start: Date,
    created: Map<string, number>,
    completed: Map<string, number>,
  ): DashboardMaintenanceTrendPointDto[] {
    return this.toDateSeries(start, DASHBOARD_TREND_DAYS).map((date) => ({
      date,
      created: created.get(date) ?? 0,
      completed: completed.get(date) ?? 0,
    }));
  }

  private toVisitorTrend(
    start: Date,
    created: Map<string, number>,
  ): DashboardVisitorTrendPointDto[] {
    return this.toDateSeries(start, DASHBOARD_TREND_DAYS).map((date) => ({
      date,
      created: created.get(date) ?? 0,
    }));
  }

  private toBroadcastTrend(
    start: Date,
    sent: Map<string, number>,
    recipientCount: Map<string, number>,
  ): DashboardBroadcastTrendPointDto[] {
    return this.toDateSeries(start, DASHBOARD_TREND_DAYS).map((date) => ({
      date,
      sent: sent.get(date) ?? 0,
      recipientCount: recipientCount.get(date) ?? 0,
    }));
  }

  private emptyTrends(start: Date): DashboardTrendsDto {
    return {
      maintenance: this.toMaintenanceTrend(start, new Map(), new Map()),
      visitors: this.toVisitorTrend(start, new Map()),
      broadcasts: this.toBroadcastTrend(start, new Map(), new Map()),
    };
  }

  private zeroSummary(): DashboardSummaryDto {
    return {
      buildingsTotal: 0,
      unitsTotal: 0,
      occupiedUnits: 0,
      vacantUnits: 0,
      occupancyRate: 0,
      activeLeases: 0,
      openMaintenanceRequests: 0,
      overdueMaintenanceRequests: 0,
      visitorsToday: 0,
      activeParkingAllocations: 0,
      broadcastsLast30Days: 0,
      unreadNotifications: 0,
    };
  }

  private countByBuilding<
    T extends { buildingId: string; _count: { _all: number } },
  >(rows: T[]) {
    return new Map(rows.map((row) => [row.buildingId, row._count._all]));
  }

  private sumCounts<T extends { _count: { _all: number } }>(rows: T[]) {
    return rows.reduce((sum, row) => sum + row._count._all, 0);
  }

  private sumDailyCounts(values: Array<number | bigint>) {
    return values.reduce<number>((sum, value) => sum + Number(value), 0);
  }

  private toDailyCountMap(rows: DailyCountRow[]) {
    return new Map(rows.map((row) => [row.date, Number(row.count)]));
  }

  private percentage(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return 0;
    }
    return Math.round((numerator / denominator) * 10000) / 100;
  }

  private formatLocation(
    buildingName?: string | null,
    unitLabel?: string | null,
  ) {
    if (buildingName && unitLabel) {
      return `${buildingName} - Unit ${unitLabel}`;
    }
    if (buildingName) {
      return buildingName;
    }
    if (unitLabel) {
      return `Unit ${unitLabel}`;
    }
    return null;
  }

  private toDateSeries(start: Date, days: number) {
    return Array.from({ length: days }, (_, index) => {
      const current = new Date(start);
      current.setDate(current.getDate() + index);
      return this.toDateKey(current);
    });
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private startOfDay(date: Date) {
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private listVisitorTrendCounts(orgId: string, start: Date) {
    return this.prisma.$queryRaw<DailyCountRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "count"
      FROM "Visitor"
      WHERE "orgId" = ${orgId}
        AND "createdAt" >= ${start}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private listMaintenanceTrendCounts(
    orgId: string,
    start: Date,
    field: 'createdAt' | 'completedAt',
  ) {
    const column = Prisma.raw(`"${field}"`);
    return this.prisma.$queryRaw<DailyCountRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', ${column}), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "count"
      FROM "MaintenanceRequest"
      WHERE "orgId" = ${orgId}
        AND ${column} IS NOT NULL
        AND ${column} >= ${start}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private listBroadcastTrendCounts(orgId: string, start: Date) {
    return this.prisma.$queryRaw<BroadcastDailyCountRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "sent",
        COALESCE(SUM("recipientCount"), 0)::int AS "recipientCount"
      FROM "Broadcast"
      WHERE "orgId" = ${orgId}
        AND "createdAt" >= ${start}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }
}

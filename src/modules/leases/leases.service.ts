import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  LeaseActivityAction,
  LeaseActivitySource,
  LeaseHistoryAction,
  Prisma as PrismaNamespace,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { UnitsRepo } from '../units/units.repo';
import { LeaseActivityRepo } from './lease-activity.repo';
import { buildLeaseChangeSet } from './lease-history.util';
import { LeaseHistoryRepo } from './lease-history.repo';
import {
  LeaseTimelineOrder,
  ListLeaseTimelineQueryDto,
} from './dto/list-lease-timeline.query.dto';
import {
  ListResidentLeaseTimelineQueryDto,
  ResidentLeaseTimelineOrder,
} from './dto/list-resident-lease-timeline.query.dto';
import {
  ListOrgLeasesQueryDto,
  OrgLeaseOrder,
} from './dto/list-org-leases.query.dto';
import {
  ListResidentLeasesQueryDto,
  ResidentLeaseOrder,
} from './dto/list-resident-leases.query.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeasesRepo } from './leases.repo';

type LeaseTimelineItem = {
  id: string;
  source: 'HISTORY' | 'ACTIVITY';
  action: LeaseHistoryAction | LeaseActivityAction;
  activitySource: LeaseActivitySource | null;
  createdAt: Date;
  changedByUserId: string | null;
  changedByUser: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  payload: unknown;
};

@Injectable()
export class LeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buildingsRepo: BuildingsRepo,
    private readonly unitsRepo: UnitsRepo,
    private readonly leasesRepo: LeasesRepo,
    private readonly leaseHistoryRepo: LeaseHistoryRepo,
    private readonly leaseActivityRepo: LeaseActivityRepo,
  ) {}

  async getActiveLeaseForUnit(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    unitId: string,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const unit = await this.unitsRepo.findByIdForBuilding(buildingId, unitId);
    if (!unit) {
      throw new BadRequestException('Unit not in building');
    }

    return this.leasesRepo.findActiveLeaseByUnit(orgId, unitId);
  }

  async getActiveLeaseForResident(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.leasesRepo.findActiveLeaseByResident(orgId, userId);
  }

  async getLeaseById(user: AuthenticatedUser | undefined, leaseId: string) {
    const orgId = assertOrgScope(user);
    const lease = await this.leasesRepo.findById(orgId, leaseId);
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  async getLeaseHistory(user: AuthenticatedUser | undefined, leaseId: string) {
    const orgId = assertOrgScope(user);
    const lease = await this.leasesRepo.findById(orgId, leaseId);
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return this.leaseHistoryRepo.listByLeaseId(orgId, leaseId);
  }

  async getLeaseTimeline(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    query: ListLeaseTimelineQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const lease = await this.leasesRepo.findById(orgId, leaseId);
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    const source = query.source ?? 'ALL';
    const order: LeaseTimelineOrder = query.order ?? 'desc';
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const dateFrom = query.date_from ? new Date(query.date_from) : null;
    const dateTo = query.date_to ? new Date(query.date_to) : null;
    if (dateFrom && dateTo && dateTo.getTime() < dateFrom.getTime()) {
      throw new BadRequestException('date_to must be on or after date_from');
    }
    const cursor = query.cursor
      ? this.decodeLeaseTimelineCursor(query.cursor)
      : null;

    const [historyItems, activityItems] = await Promise.all([
      source === 'ACTIVITY'
        ? Promise.resolve([])
        : this.leaseHistoryRepo.listByLeaseId(orgId, leaseId, {
            action: query.historyAction,
            order,
          }),
      source === 'HISTORY'
        ? Promise.resolve([])
        : this.leaseActivityRepo.listByLeaseId(orgId, leaseId, {
            action: query.activityAction,
            order,
          }),
    ]);

    let timelineItems: LeaseTimelineItem[] = [
      ...historyItems.map((item) => ({
        id: item.id,
        source: 'HISTORY' as const,
        action: item.action,
        activitySource: null,
        createdAt: item.createdAt,
        changedByUserId: item.changedByUserId ?? null,
        changedByUser: item.changedByUser ?? null,
        payload: { changes: item.changes },
      })),
      ...activityItems.map((item) => ({
        id: item.id,
        source: 'ACTIVITY' as const,
        action: item.action,
        activitySource: item.source ?? LeaseActivitySource.USER,
        createdAt: item.createdAt,
        changedByUserId: item.changedByUserId ?? null,
        changedByUser: item.changedByUser ?? null,
        payload: item.payload,
      })),
    ];

    timelineItems = timelineItems.sort((a, b) => {
      const compared = this.compareTimelineKeyAsc(
        { id: a.id, source: a.source, createdAt: a.createdAt },
        { id: b.id, source: b.source, createdAt: b.createdAt },
      );
      return order === 'asc' ? compared : -compared;
    });

    if (dateFrom || dateTo) {
      timelineItems = timelineItems.filter((item) => {
        if (dateFrom && item.createdAt.getTime() < dateFrom.getTime()) {
          return false;
        }
        if (dateTo && item.createdAt.getTime() > dateTo.getTime()) {
          return false;
        }
        return true;
      });
    }

    if (cursor) {
      timelineItems = timelineItems.filter((item) => {
        const compared = this.compareTimelineKeyAsc(
          { id: item.id, source: item.source, createdAt: item.createdAt },
          cursor,
        );
        return order === 'asc' ? compared > 0 : compared < 0;
      });
    }

    const hasMore = timelineItems.length > limit;
    const sliced = hasMore ? timelineItems.slice(0, limit) : timelineItems;
    const nextCursor = hasMore
      ? this.encodeLeaseTimelineCursor({
          id: sliced[sliced.length - 1].id,
          source: sliced[sliced.length - 1].source,
          createdAt: sliced[sliced.length - 1].createdAt,
        })
      : undefined;

    return {
      items: sliced.map((item) => ({
        id: `${item.source.toLowerCase()}:${item.id}`,
        source: item.source,
        action: item.action,
        activitySource: item.activitySource,
        createdAt: item.createdAt,
        changedByUserId: item.changedByUserId,
        changedByUser: item.changedByUser,
        payload: item.payload,
      })),
      nextCursor,
    };
  }

  async listResidentLeases(
    user: AuthenticatedUser | undefined,
    residentUserId: string,
    query: ListResidentLeasesQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.assertResidentInOrg(orgId, residentUserId);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const order: ResidentLeaseOrder = query.order ?? 'desc';
    const cursor = query.cursor
      ? this.decodeResidentLeaseCursor(query.cursor)
      : null;

    const items = await this.leasesRepo.listByResident(orgId, residentUserId, {
      status: query.status ?? 'ALL',
      order,
      cursor: cursor ?? undefined,
      limit: limit + 1,
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeResidentLeaseCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  async listOrgLeases(
    user: AuthenticatedUser | undefined,
    query: ListOrgLeasesQueryDto,
  ) {
    const orgId = assertOrgScope(user);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const order: OrgLeaseOrder = query.order ?? 'desc';
    const dateFrom = query.date_from ? new Date(query.date_from) : null;
    const dateTo = query.date_to ? new Date(query.date_to) : null;
    if (dateFrom && dateTo && dateTo.getTime() < dateFrom.getTime()) {
      throw new BadRequestException('date_to must be on or after date_from');
    }
    const cursor = query.cursor
      ? this.decodeResidentLeaseCursor(query.cursor)
      : null;

    const items = await this.leasesRepo.listByOrg(orgId, {
      status: query.status ?? 'ALL',
      order,
      buildingId: query.buildingId,
      unitId: query.unitId,
      residentUserId: query.residentUserId,
      q: query.q?.trim() || undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
      cursor: cursor ?? undefined,
      limit: limit + 1,
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeResidentLeaseCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  async listResidentLeaseTimeline(
    user: AuthenticatedUser | undefined,
    residentUserId: string,
    query: ListResidentLeaseTimelineQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.assertResidentInOrg(orgId, residentUserId);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const order: ResidentLeaseTimelineOrder = query.order ?? 'desc';
    const cursor = query.cursor
      ? this.decodeResidentLeaseTimelineCursor(query.cursor)
      : null;

    const items = await this.leaseHistoryRepo.listByResident(
      orgId,
      residentUserId,
      {
        action: query.action,
        order,
        cursor: cursor ?? undefined,
        limit: limit + 1,
      },
    );

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeResidentLeaseTimelineCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  async updateLease(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    dto: UpdateLeaseDto,
  ) {
    const orgId = assertOrgScope(user);
    const lease = await this.leasesRepo.findById(orgId, leaseId);
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    const data = this.buildUpdateData(dto);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No lease fields provided');
    }

    const nextStartAt =
      data.leaseStartDate instanceof Date
        ? data.leaseStartDate
        : lease.leaseStartDate;
    const nextEndAt =
      data.leaseEndDate instanceof Date
        ? data.leaseEndDate
        : lease.leaseEndDate;
    if (nextEndAt.getTime() <= nextStartAt.getTime()) {
      throw new BadRequestException(
        'leaseEndDate must be after leaseStartDate',
      );
    }

    const updated = await this.leasesRepo.updateLeaseForOrg(
      orgId,
      leaseId,
      data,
    );
    if (!updated) {
      throw new NotFoundException('Lease not found');
    }

    const changes = buildLeaseChangeSet(lease, updated);
    if (Object.keys(changes).length > 0) {
      await this.leaseHistoryRepo.create({
        orgId,
        leaseId: updated.id,
        action: LeaseHistoryAction.UPDATED,
        changedByUserId: user?.sub ?? null,
        changes,
      });
    }

    return updated;
  }

  private buildUpdateData(
    dto: UpdateLeaseDto,
  ): PrismaNamespace.LeaseUncheckedUpdateInput {
    const data: PrismaNamespace.LeaseUncheckedUpdateInput = {};

    if (dto.leaseStartDate !== undefined) {
      data.leaseStartDate = new Date(dto.leaseStartDate);
    }
    if (dto.leaseEndDate !== undefined) {
      data.leaseEndDate = new Date(dto.leaseEndDate);
    }
    if (dto.tenancyRegistrationExpiry !== undefined) {
      data.tenancyRegistrationExpiry = dto.tenancyRegistrationExpiry
        ? new Date(dto.tenancyRegistrationExpiry)
        : null;
    }
    if (dto.noticeGivenDate !== undefined) {
      data.noticeGivenDate = dto.noticeGivenDate
        ? new Date(dto.noticeGivenDate)
        : null;
    }
    if (dto.annualRent !== undefined) {
      data.annualRent = this.toDecimal(dto.annualRent, 'annualRent');
    }
    if (dto.paymentFrequency !== undefined) {
      data.paymentFrequency = dto.paymentFrequency;
    }
    if (dto.numberOfCheques !== undefined) {
      data.numberOfCheques = dto.numberOfCheques;
    }
    if (dto.securityDepositAmount !== undefined) {
      data.securityDepositAmount = this.toDecimal(
        dto.securityDepositAmount,
        'securityDepositAmount',
      );
    }
    if (dto.internetTvProvider !== undefined) {
      data.internetTvProvider = dto.internetTvProvider;
    }
    if (dto.serviceChargesPaidBy !== undefined) {
      data.serviceChargesPaidBy = dto.serviceChargesPaidBy;
    }
    if (dto.vatApplicable !== undefined) {
      data.vatApplicable = dto.vatApplicable;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }
    if (dto.firstPaymentReceived !== undefined) {
      data.firstPaymentReceived = dto.firstPaymentReceived;
    }
    if (dto.firstPaymentAmount !== undefined) {
      data.firstPaymentAmount = dto.firstPaymentAmount
        ? this.toDecimal(dto.firstPaymentAmount, 'firstPaymentAmount')
        : null;
    }
    if (dto.depositReceived !== undefined) {
      data.depositReceived = dto.depositReceived;
    }
    if (dto.depositReceivedAmount !== undefined) {
      data.depositReceivedAmount = dto.depositReceivedAmount
        ? this.toDecimal(dto.depositReceivedAmount, 'depositReceivedAmount')
        : null;
    }

    return data;
  }

  private toDecimal(value: string, field: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${field} must be a valid decimal string`);
    }
    try {
      return new PrismaNamespace.Decimal(trimmed);
    } catch {
      throw new BadRequestException(`${field} must be a valid decimal string`);
    }
  }

  private async assertResidentInOrg(orgId: string, residentUserId: string) {
    const resident = await this.prisma.user.findFirst({
      where: { id: residentUserId, orgId },
      select: { id: true },
    });
    if (!resident) {
      throw new NotFoundException('Resident not found');
    }
  }

  private encodeResidentLeaseCursor(item: {
    id: string;
    leaseStartDate: Date;
  }) {
    return Buffer.from(
      JSON.stringify({ id: item.id, v: item.leaseStartDate.toISOString() }),
    ).toString('base64');
  }

  private decodeResidentLeaseCursor(cursor: string): {
    id: string;
    value: Date;
  } {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    let payload: { id: string; v: string };
    try {
      payload = JSON.parse(decoded) as { id: string; v: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    if (!payload?.id || !payload.v) {
      throw new BadRequestException('Invalid cursor');
    }

    const value = new Date(payload.v);
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { id: payload.id, value };
  }

  private encodeResidentLeaseTimelineCursor(item: {
    id: string;
    createdAt: Date;
  }) {
    return Buffer.from(
      JSON.stringify({ id: item.id, v: item.createdAt.toISOString() }),
    ).toString('base64');
  }

  private decodeResidentLeaseTimelineCursor(cursor: string): {
    id: string;
    value: Date;
  } {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    let payload: { id: string; v: string };
    try {
      payload = JSON.parse(decoded) as { id: string; v: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    if (!payload?.id || !payload.v) {
      throw new BadRequestException('Invalid cursor');
    }

    const value = new Date(payload.v);
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { id: payload.id, value };
  }

  private compareTimelineKeyAsc(
    a: { id: string; source: 'HISTORY' | 'ACTIVITY'; createdAt: Date },
    b: { id: string; source: 'HISTORY' | 'ACTIVITY'; createdAt: Date },
  ) {
    const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }
    const left = `${a.source}:${a.id}`;
    const right = `${b.source}:${b.id}`;
    return left.localeCompare(right);
  }

  private encodeLeaseTimelineCursor(item: {
    id: string;
    source: 'HISTORY' | 'ACTIVITY';
    createdAt: Date;
  }) {
    return Buffer.from(
      JSON.stringify({
        id: item.id,
        s: item.source,
        v: item.createdAt.toISOString(),
      }),
    ).toString('base64');
  }

  private decodeLeaseTimelineCursor(cursor: string): {
    id: string;
    source: 'HISTORY' | 'ACTIVITY';
    createdAt: Date;
  } {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    let payload: { id: string; s: 'HISTORY' | 'ACTIVITY'; v: string };
    try {
      payload = JSON.parse(decoded) as {
        id: string;
        s: 'HISTORY' | 'ACTIVITY';
        v: string;
      };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    if (!payload?.id || !payload.s || !payload.v) {
      throw new BadRequestException('Invalid cursor');
    }
    if (payload.s !== 'HISTORY' && payload.s !== 'ACTIVITY') {
      throw new BadRequestException('Invalid cursor');
    }

    const createdAt = new Date(payload.v);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { id: payload.id, source: payload.s, createdAt };
  }
}

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { BuildingScopeResolverService } from '../src/common/building-access/building-scope-resolver.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { LeasesController } from '../src/modules/leases/leases.controller';
import { LeaseActivityRepo } from '../src/modules/leases/lease-activity.repo';
import { LeaseHistoryRepo } from '../src/modules/leases/lease-history.repo';
import { LeasesRepo } from '../src/modules/leases/leases.repo';
import { LeasesService } from '../src/modules/leases/leases.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type OrgRecord = {
  id: string;
  name: string;
};

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
};

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
};

type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
};

type LeaseRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId: string;
  occupancyId: string;
  status: 'ACTIVE' | 'ENDED';
  leaseStartDate: Date;
  leaseEndDate: Date;
  tenancyRegistrationExpiry?: Date | null;
  noticeGivenDate?: Date | null;
  annualRent: string;
  paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  numberOfCheques?: number | null;
  securityDepositAmount: string;
  internetTvProvider?: string | null;
  serviceChargesPaidBy?: 'OWNER' | 'TENANT' | null;
  vatApplicable?: boolean | null;
  notes?: string | null;
  firstPaymentReceived?: 'YES' | 'NO' | null;
  firstPaymentAmount?: string | null;
  depositReceived?: 'YES' | 'NO' | null;
  depositReceivedAmount?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LeaseHistoryRecord = {
  id: string;
  orgId: string;
  leaseId: string;
  action: 'CREATED' | 'UPDATED' | 'MOVED_OUT';
  changedByUserId: string | null;
  changes: Record<string, unknown>;
  createdAt: Date;
};

type LeaseActivityRecord = {
  id: string;
  orgId: string;
  leaseId: string;
  action:
    | 'MOVE_IN'
    | 'MOVE_OUT'
    | 'DOCUMENT_ADDED'
    | 'DOCUMENT_DELETED'
    | 'ACCESS_CARD_ISSUED'
    | 'ACCESS_CARD_STATUS_CHANGED'
    | 'ACCESS_CARD_DELETED'
    | 'PARKING_STICKER_ISSUED'
    | 'PARKING_STICKER_STATUS_CHANGED'
    | 'PARKING_STICKER_DELETED'
    | 'OCCUPANTS_REPLACED'
    | 'PARKING_ALLOCATED';
  source: 'USER' | 'SYSTEM';
  changedByUserId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private units: UnitRecord[] = [];
  private occupancies: OccupancyRecord[] = [];
  private leases: LeaseRecord[] = [];
  private leaseHistories: LeaseHistoryRecord[] = [];
  private leaseActivities: LeaseActivityRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const org: OrgRecord = { id: randomUUID(), name: data.name };
      this.orgs.push(org);
      return org;
    },
  };

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((user) => user.id === where.id) ?? null;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; orgId?: string | null };
      select?: { id?: boolean };
    }) => {
      return (
        this.users.find((user) => {
          if (where.id && user.id !== where.id) {
            return false;
          }
          if (where.orgId !== undefined && user.orgId !== where.orgId) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: { email: string; orgId: string; isActive: boolean };
    }) => {
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        isActive: data.isActive,
      };
      this.users.push(user);
      return user;
    },
  };

  building = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        name: string;
        city: string;
        country: string;
        timezone: string;
      };
    }) => {
      const building: BuildingRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        name: data.name,
        city: data.city,
        country: data.country,
        timezone: data.timezone,
      };
      this.buildings.push(building);
      return building;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; orgId?: string };
    }) => {
      return (
        this.buildings.find((building) => {
          if (where.id && building.id !== where.id) {
            return false;
          }
          if (where.orgId && building.orgId !== where.orgId) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
  };

  unit = {
    create: async ({
      data,
    }: {
      data: { buildingId: string; label: string };
    }) => {
      const unit: UnitRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        label: data.label,
      };
      this.units.push(unit);
      return unit;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; buildingId?: string };
    }) => {
      return (
        this.units.find((unit) => {
          if (where.id && unit.id !== where.id) {
            return false;
          }
          if (where.buildingId && unit.buildingId !== where.buildingId) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
  };

  buildingAssignment = {
    findMany: async () => {
      return [];
    },
  };

  occupancy = {
    create: async ({
      data,
    }: {
      data: {
        buildingId: string;
        unitId: string;
        residentUserId: string;
        status: 'ACTIVE' | 'ENDED';
      };
    }) => {
      const occupancy: OccupancyRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        unitId: data.unitId,
        residentUserId: data.residentUserId,
        status: data.status,
      };
      this.occupancies.push(occupancy);
      return occupancy;
    },
    findFirst: async ({
      where,
    }: {
      where: { buildingId: string; residentUserId: string; status: 'ACTIVE' };
    }) => {
      return (
        this.occupancies.find(
          (occ) =>
            occ.buildingId === where.buildingId &&
            occ.residentUserId === where.residentUserId &&
            occ.status === where.status,
        ) ?? null
      );
    },
  };

  lease = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        buildingId: string;
        unitId: string;
        occupancyId: string;
        status: 'ACTIVE' | 'ENDED';
        leaseStartDate: Date;
        leaseEndDate: Date;
        annualRent: string;
        paymentFrequency: LeaseRecord['paymentFrequency'];
        securityDepositAmount: string;
      };
    }) => {
      const now = new Date();
      const lease: LeaseRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        buildingId: data.buildingId,
        unitId: data.unitId,
        occupancyId: data.occupancyId,
        status: data.status,
        leaseStartDate: data.leaseStartDate,
        leaseEndDate: data.leaseEndDate,
        tenancyRegistrationExpiry: null,
        noticeGivenDate: null,
        annualRent: data.annualRent,
        paymentFrequency: data.paymentFrequency,
        numberOfCheques: null,
        securityDepositAmount: data.securityDepositAmount,
        internetTvProvider: null,
        serviceChargesPaidBy: null,
        vatApplicable: null,
        notes: null,
        firstPaymentReceived: null,
        firstPaymentAmount: null,
        depositReceived: null,
        depositReceivedAmount: null,
        createdAt: now,
        updatedAt: now,
      };
      this.leases.push(lease);
      return lease;
    },
    findFirst: async ({
      where,
    }: {
      where: {
        id?: string;
        orgId?: string;
        unitId?: string;
        status?: 'ACTIVE' | 'ENDED';
        occupancy?: { status?: 'ACTIVE' | 'ENDED' };
      };
    }) => {
      return (
        this.leases.find((lease) => {
          if (where.id && lease.id !== where.id) {
            return false;
          }
          if (where.orgId && lease.orgId !== where.orgId) {
            return false;
          }
          if (where.unitId && lease.unitId !== where.unitId) {
            return false;
          }
          if (where.status && lease.status !== where.status) {
            return false;
          }
          if (where.occupancy?.status) {
            const occupancy = this.occupancies.find(
              (occ) => occ.id === lease.occupancyId,
            );
            if (!occupancy || occupancy.status !== where.occupancy.status) {
              return false;
            }
          }
          return true;
        }) ?? null
      );
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; orgId?: string };
      data: Partial<LeaseRecord>;
    }) => {
      let count = 0;
      this.leases = this.leases.map((lease) => {
        if (where.id && lease.id !== where.id) {
          return lease;
        }
        if (where.orgId && lease.orgId !== where.orgId) {
          return lease;
        }
        count += 1;
        return {
          ...lease,
          ...data,
          updatedAt: new Date(),
        };
      });
      return { count };
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: any;
      orderBy?: Array<{ leaseStartDate?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
      take?: number;
    }) => {
      const includesInsensitive = (source: string, target: string) =>
        source.toLowerCase().includes(target.toLowerCase());

      let items = this.leases.filter((lease) => {
        if (where.orgId && lease.orgId !== where.orgId) {
          return false;
        }
        if (where.status && lease.status !== where.status) {
          return false;
        }
        if (where.buildingId && lease.buildingId !== where.buildingId) {
          return false;
        }
        if (where.unitId && lease.unitId !== where.unitId) {
          return false;
        }
        if (where.occupancy?.residentUserId) {
          const occupancy = this.occupancies.find(
            (o) => o.id === lease.occupancyId,
          );
          if (
            !occupancy ||
            occupancy.residentUserId !== where.occupancy.residentUserId
          ) {
            return false;
          }
        }

        if (where.AND?.length) {
          const andPass = where.AND.every((andItem: any) => {
            if (andItem.leaseStartDate?.gte || andItem.leaseStartDate?.lte) {
              if (
                andItem.leaseStartDate.gte &&
                lease.leaseStartDate < andItem.leaseStartDate.gte
              ) {
                return false;
              }
              if (
                andItem.leaseStartDate.lte &&
                lease.leaseStartDate > andItem.leaseStartDate.lte
              ) {
                return false;
              }
              return true;
            }

            return andItem.OR.some((orItem: any) => {
              if (orItem.leaseStartDate?.lt) {
                return lease.leaseStartDate < orItem.leaseStartDate.lt;
              }
              if (orItem.leaseStartDate?.gt) {
                return lease.leaseStartDate > orItem.leaseStartDate.gt;
              }
              if (orItem.id && lease.id === orItem.id) {
                return true;
              }
              if (orItem.unit?.label?.contains) {
                const unit = this.units.find((u) => u.id === lease.unitId);
                return unit
                  ? includesInsensitive(
                      unit.label,
                      String(orItem.unit.label.contains),
                    )
                  : false;
              }
              if (orItem.building?.name?.contains) {
                const building = this.buildings.find(
                  (b) => b.id === lease.buildingId,
                );
                return building
                  ? includesInsensitive(
                      building.name,
                      String(orItem.building.name.contains),
                    )
                  : false;
              }
              if (orItem.occupancy?.residentUser?.name?.contains) {
                const occupancy = this.occupancies.find(
                  (o) => o.id === lease.occupancyId,
                );
                const resident = occupancy
                  ? this.users.find((u) => u.id === occupancy.residentUserId)
                  : null;
                return resident?.email
                  ? includesInsensitive(
                      resident.email,
                      String(orItem.occupancy.residentUser.name.contains),
                    )
                  : false;
              }
              if (orItem.occupancy?.residentUser?.email?.contains) {
                const occupancy = this.occupancies.find(
                  (o) => o.id === lease.occupancyId,
                );
                const resident = occupancy
                  ? this.users.find((u) => u.id === occupancy.residentUserId)
                  : null;
                return resident?.email
                  ? includesInsensitive(
                      resident.email,
                      String(orItem.occupancy.residentUser.email.contains),
                    )
                  : false;
              }
              if (orItem.AND?.length) {
                return orItem.AND.every((cond: any) => {
                  if (
                    cond.leaseStartDate &&
                    lease.leaseStartDate.getTime() !==
                      cond.leaseStartDate.getTime()
                  ) {
                    return false;
                  }
                  if (cond.id?.lt && !(lease.id < cond.id.lt)) {
                    return false;
                  }
                  if (cond.id?.gt && !(lease.id > cond.id.gt)) {
                    return false;
                  }
                  return true;
                });
              }
              return false;
            });
          });
          if (!andPass) {
            return false;
          }
        }

        return true;
      });

      const leaseStartOrder =
        orderBy?.find((item) => item.leaseStartDate)?.leaseStartDate ?? 'desc';
      const idOrder = orderBy?.find((item) => item.id)?.id ?? leaseStartOrder;

      items.sort((a, b) => {
        const startDiff =
          a.leaseStartDate.getTime() - b.leaseStartDate.getTime();
        if (startDiff !== 0) {
          return leaseStartOrder === 'asc' ? startDiff : -startDiff;
        }
        const idDiff = a.id.localeCompare(b.id);
        return idOrder === 'asc' ? idDiff : -idDiff;
      });

      if (take !== undefined) {
        items = items.slice(0, take);
      }

      return items;
    },
  };

  leaseHistory = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        leaseId: string;
        action: LeaseHistoryRecord['action'];
        changedByUserId?: string | null;
        changes: Record<string, unknown>;
        createdAt?: Date;
      };
    }) => {
      const record: LeaseHistoryRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        changedByUserId: data.changedByUserId ?? null,
        changes: data.changes,
        createdAt: data.createdAt ?? new Date(),
      };
      this.leaseHistories.push(record);
      return record;
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: {
        orgId?: string;
        leaseId?: string;
        action?: LeaseHistoryRecord['action'];
        lease?: {
          occupancy?: { residentUserId?: string };
        };
        AND?: Array<{
          OR: Array<{
            createdAt?: { lt?: Date; gt?: Date };
            AND?: Array<{
              createdAt?: Date;
              id?: { lt?: string; gt?: string };
            }>;
          }>;
        }>;
      };
      orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
      take?: number;
    }) => {
      let items = this.leaseHistories.filter((item) => {
        if (where.orgId && item.orgId !== where.orgId) {
          return false;
        }
        if (where.leaseId && item.leaseId !== where.leaseId) {
          return false;
        }
        if (where.action && item.action !== where.action) {
          return false;
        }

        if (where.lease?.occupancy?.residentUserId) {
          const lease = this.leases.find((l) => l.id === item.leaseId);
          if (!lease) {
            return false;
          }
          const occupancy = this.occupancies.find(
            (o) => o.id === lease.occupancyId,
          );
          if (
            !occupancy ||
            occupancy.residentUserId !== where.lease.occupancy.residentUserId
          ) {
            return false;
          }
        }

        if (where.AND?.length) {
          const andPass = where.AND.every((andItem) => {
            return andItem.OR.some((orItem) => {
              if (orItem.createdAt?.lt) {
                return item.createdAt < orItem.createdAt.lt;
              }
              if (orItem.createdAt?.gt) {
                return item.createdAt > orItem.createdAt.gt;
              }
              if (orItem.AND?.length) {
                return orItem.AND.every((cond) => {
                  if (
                    cond.createdAt &&
                    item.createdAt.getTime() !== cond.createdAt.getTime()
                  ) {
                    return false;
                  }
                  if (cond.id?.lt && !(item.id < cond.id.lt)) {
                    return false;
                  }
                  if (cond.id?.gt && !(item.id > cond.id.gt)) {
                    return false;
                  }
                  return true;
                });
              }
              return false;
            });
          });
          if (!andPass) {
            return false;
          }
        }

        return true;
      });

      const createdAtOrder =
        orderBy?.find((item) => item.createdAt)?.createdAt ?? 'desc';
      const idOrder = orderBy?.find((item) => item.id)?.id ?? createdAtOrder;

      items.sort((a, b) => {
        const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
        if (createdAtDiff !== 0) {
          return createdAtOrder === 'asc' ? createdAtDiff : -createdAtDiff;
        }
        const idDiff = a.id.localeCompare(b.id);
        return idOrder === 'asc' ? idDiff : -idDiff;
      });

      if (take !== undefined) {
        items = items.slice(0, take);
      }

      return items.map((item) => {
        const changedByUser = item.changedByUserId
          ? (this.users.find((u) => u.id === item.changedByUserId) ?? null)
          : null;
        const lease = this.leases.find((l) => l.id === item.leaseId) ?? null;
        return {
          ...item,
          changedByUser: changedByUser
            ? {
                id: changedByUser.id,
                name: null,
                email: changedByUser.email,
              }
            : null,
          lease: lease
            ? {
                id: lease.id,
                status: lease.status,
                buildingId: lease.buildingId,
                unitId: lease.unitId,
                occupancyId: lease.occupancyId,
                leaseStartDate: lease.leaseStartDate,
                leaseEndDate: lease.leaseEndDate,
              }
            : null,
        };
      });
    },
  };

  leaseActivity = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        leaseId: string;
        action: LeaseActivityRecord['action'];
        source?: LeaseActivityRecord['source'];
        changedByUserId?: string | null;
        payload: Record<string, unknown>;
        createdAt?: Date;
      };
    }) => {
      const record: LeaseActivityRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        source: data.source ?? 'USER',
        changedByUserId: data.changedByUserId ?? null,
        payload: data.payload,
        createdAt: data.createdAt ?? new Date(),
      };
      this.leaseActivities.push(record);
      const changedByUser = record.changedByUserId
        ? (this.users.find((u) => u.id === record.changedByUserId) ?? null)
        : null;
      return {
        ...record,
        changedByUser: changedByUser
          ? {
              id: changedByUser.id,
              name: null,
              email: changedByUser.email,
            }
          : null,
      };
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: {
        orgId?: string;
        leaseId?: string;
        action?: LeaseActivityRecord['action'];
      };
      orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
      take?: number;
    }) => {
      let items = this.leaseActivities.filter((item) => {
        if (where.orgId && item.orgId !== where.orgId) {
          return false;
        }
        if (where.leaseId && item.leaseId !== where.leaseId) {
          return false;
        }
        if (where.action && item.action !== where.action) {
          return false;
        }
        return true;
      });

      const createdAtOrder =
        orderBy?.find((item) => item.createdAt)?.createdAt ?? 'desc';
      const idOrder = orderBy?.find((item) => item.id)?.id ?? createdAtOrder;

      items.sort((a, b) => {
        const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
        if (createdAtDiff !== 0) {
          return createdAtOrder === 'asc' ? createdAtDiff : -createdAtDiff;
        }
        const idDiff = a.id.localeCompare(b.id);
        return idOrder === 'asc' ? idDiff : -idDiff;
      });

      if (take !== undefined) {
        items = items.slice(0, take);
      }

      return items.map((item) => {
        const changedByUser = item.changedByUserId
          ? (this.users.find((u) => u.id === item.changedByUserId) ?? null)
          : null;
        return {
          ...item,
          changedByUser: changedByUser
            ? {
                id: changedByUser.id,
                name: null,
                email: changedByUser.email,
              }
            : null,
        };
      });
    },
  };

  reset() {
    this.orgs = [];
    this.users = [];
    this.buildings = [];
    this.units = [];
    this.occupancies = [];
    this.leases = [];
    this.leaseHistories = [];
    this.leaseActivities = [];
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return false;
    }
    request.user = {
      sub: userId,
      email: user.email,
      orgId: user.orgId ?? null,
    };
    return true;
  }
}

describe('Leases (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let org: OrgRecord;
  let user: UserRecord;
  let building: BuildingRecord;
  let unit: UnitRecord;

  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [LeasesController],
      providers: [
        LeasesService,
        LeasesRepo,
        LeaseHistoryRepo,
        LeaseActivityRepo,
        BuildingsRepo,
        UnitsRepo,
        BuildingAccessService,
        OrgScopeGuard,
        PermissionsGuard,
        BuildingAccessGuard,
        {
          provide: BuildingScopeResolverService,
          useValue: {
            resolveForRequest: async () => undefined,
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (userId: string) =>
              permissionsByUser.get(userId) ?? new Set<string>(),
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    prisma.reset();
    permissionsByUser.clear();

    org = await prisma.org.create({ data: { name: 'Org A' } });
    user = await prisma.user.create({
      data: {
        email: 'user@org.test',
        orgId: org.id,
        isActive: true,
      },
    });
    building = await prisma.building.create({
      data: {
        orgId: org.id,
        name: 'Towerdesk HQ',
        city: 'Dubai',
        country: 'ARE',
        timezone: 'Asia/Dubai',
      },
    });
    unit = await prisma.unit.create({
      data: { buildingId: building.id, label: '101' },
    });
  });

  it('rejects requests without leases.read permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/buildings/${building.id}/units/${unit.id}/lease/active`,
      {
        headers: { 'x-user-id': user.id },
      },
    );

    expect(response.status).toBe(403);
  });

  it('returns active lease when user has leases.read', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    const response = await fetch(
      `${baseUrl}/org/buildings/${building.id}/units/${unit.id}/lease/active`,
      {
        headers: { 'x-user-id': user.id },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(lease.id);
  });

  it('rejects lease updates without leases.write permission', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    const response = await fetch(`${baseUrl}/org/leases/${lease.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify({
        paymentFrequency: 'QUARTERLY',
      }),
    });

    expect(response.status).toBe(403);
  });

  it('updates lease fields when user has leases.write', async () => {
    permissionsByUser.set(user.id, new Set(['leases.write']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    const response = await fetch(`${baseUrl}/org/leases/${lease.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify({
        leaseEndDate: '2026-06-01T00:00:00.000Z',
        paymentFrequency: 'QUARTERLY',
        numberOfCheques: 4,
        notes: 'Renewed terms',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(lease.id);
    expect(body.paymentFrequency).toBe('QUARTERLY');
    expect(body.numberOfCheques).toBe(4);
    expect(body.notes).toBe('Renewed terms');
    expect(body.leaseEndDate).toBe('2026-06-01T00:00:00.000Z');
  });

  it('rejects lease history reads without leases.read permission', async () => {
    permissionsByUser.set(user.id, new Set(['leases.write']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    const response = await fetch(`${baseUrl}/org/leases/${lease.id}/history`, {
      headers: { 'x-user-id': user.id },
    });

    expect(response.status).toBe(403);
  });

  it('returns lease history after a lease update', async () => {
    permissionsByUser.set(user.id, new Set(['leases.write', 'leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    const patchResponse = await fetch(`${baseUrl}/org/leases/${lease.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify({
        notes: 'Lease renewed',
      }),
    });
    expect(patchResponse.status).toBe(200);

    const historyResponse = await fetch(
      `${baseUrl}/org/leases/${lease.id}/history`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(historyResponse.status).toBe(200);

    const history = await historyResponse.json();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(1);
    expect(history[0].action).toBe('UPDATED');
    expect(history[0].changedByUserId).toBe(user.id);
    expect(history[0].changes.notes.from).toBeNull();
    expect(history[0].changes.notes.to).toBe('Lease renewed');
  });

  it('returns unified lease timeline merged from history and activity', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    await prisma.leaseHistory.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'UPDATED',
        changedByUserId: user.id,
        changes: { notes: { from: null, to: 'Lease renewed' } },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.leaseActivity.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'DOCUMENT_ADDED',
        source: 'USER',
        changedByUserId: user.id,
        payload: { documentId: randomUUID(), fileName: 'contract.pdf' },
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });

    const response = await fetch(`${baseUrl}/org/leases/${lease.id}/timeline`, {
      headers: { 'x-user-id': user.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(2);
    expect(body.items[0].source).toBe('ACTIVITY');
    expect(body.items[0].action).toBe('DOCUMENT_ADDED');
    expect(body.items[1].source).toBe('HISTORY');
    expect(body.items[1].action).toBe('UPDATED');
  });

  it('filters lease timeline by source and activity action', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    await prisma.leaseActivity.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'DOCUMENT_ADDED',
        source: 'USER',
        changedByUserId: user.id,
        payload: { documentId: randomUUID() },
      },
    });
    await prisma.leaseActivity.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'ACCESS_CARD_ISSUED',
        source: 'USER',
        changedByUserId: user.id,
        payload: { cardNumbers: ['A1'] },
      },
    });

    const response = await fetch(
      `${baseUrl}/org/leases/${lease.id}/timeline?source=ACTIVITY&activityAction=DOCUMENT_ADDED`,
      {
        headers: { 'x-user-id': user.id },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].source).toBe('ACTIVITY');
    expect(body.items[0].action).toBe('DOCUMENT_ADDED');
  });

  it('filters lease timeline by date_from/date_to', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    await prisma.leaseHistory.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'UPDATED',
        changedByUserId: user.id,
        changes: { notes: { from: null, to: 'v1' } },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.leaseActivity.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'DOCUMENT_ADDED',
        source: 'USER',
        changedByUserId: user.id,
        payload: { documentId: randomUUID() },
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
      },
    });
    await prisma.leaseActivity.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'ACCESS_CARD_ISSUED',
        source: 'USER',
        changedByUserId: user.id,
        payload: { cardNumbers: ['A1'] },
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });

    const response = await fetch(
      `${baseUrl}/org/leases/${lease.id}/timeline?date_from=2026-01-05T00:00:00.000Z&date_to=2026-01-31T23:59:59.999Z`,
      {
        headers: { 'x-user-id': user.id },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].action).toBe('DOCUMENT_ADDED');
  });

  it('returns 400 when date_to is before date_from for lease timeline', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    const response = await fetch(
      `${baseUrl}/org/leases/${lease.id}/timeline?date_from=2026-02-01T00:00:00.000Z&date_to=2026-01-01T00:00:00.000Z`,
      {
        headers: { 'x-user-id': user.id },
      },
    );

    expect(response.status).toBe(400);
  });

  it('returns org leases across residents including active and ended', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const residentTwo = await prisma.user.create({
      data: {
        email: 'resident-two@org.test',
        orgId: org.id,
        isActive: true,
      },
    });

    const endedOccupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ENDED',
      },
    });
    const activeOccupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: residentTwo.id,
        status: 'ACTIVE',
      },
    });

    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: endedOccupancy.id,
        status: 'ENDED',
        leaseStartDate: new Date('2024-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2025-01-01T00:00:00.000Z'),
        annualRent: '100000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });
    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: activeOccupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-02-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-02-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '6000.00',
      },
    });

    const response = await fetch(`${baseUrl}/org/leases`, {
      headers: { 'x-user-id': user.id },
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(2);
    expect(body.items[0].status).toBe('ACTIVE');
    expect(body.items[1].status).toBe('ENDED');
  });

  it('filters org leases by buildingId', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const otherBuilding = await prisma.building.create({
      data: {
        orgId: org.id,
        name: 'Annex Tower',
        city: 'Dubai',
        country: 'ARE',
        timezone: 'Asia/Dubai',
      },
    });
    const otherUnit = await prisma.unit.create({
      data: { buildingId: otherBuilding.id, label: 'A-1' },
    });

    const occupancyA = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });
    const occupancyB = await prisma.occupancy.create({
      data: {
        buildingId: otherBuilding.id,
        unitId: otherUnit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancyA.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });
    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: otherBuilding.id,
        unitId: otherUnit.id,
        occupancyId: occupancyB.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-02-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-02-01T00:00:00.000Z'),
        annualRent: '130000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5500.00',
      },
    });

    const response = await fetch(
      `${baseUrl}/org/leases?buildingId=${encodeURIComponent(building.id)}`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].buildingId).toBe(building.id);
  });

  it('returns org leases with status filter and cursor pagination', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const endedOccupancyA = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ENDED',
      },
    });
    const endedOccupancyB = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ENDED',
      },
    });

    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: endedOccupancyA.id,
        status: 'ENDED',
        leaseStartDate: new Date('2024-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2025-01-01T00:00:00.000Z'),
        annualRent: '100000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });
    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: endedOccupancyB.id,
        status: 'ENDED',
        leaseStartDate: new Date('2023-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2024-01-01T00:00:00.000Z'),
        annualRent: '90000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '4000.00',
      },
    });

    const firstResponse = await fetch(
      `${baseUrl}/org/leases?status=ENDED&limit=1`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(firstResponse.status).toBe(200);

    const firstPage = await firstResponse.json();
    expect(firstPage.items.length).toBe(1);
    expect(firstPage.items[0].status).toBe('ENDED');
    expect(firstPage.nextCursor).toBeTruthy();

    const secondResponse = await fetch(
      `${baseUrl}/org/leases?status=ENDED&limit=1&cursor=${encodeURIComponent(
        firstPage.nextCursor,
      )}`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(secondResponse.status).toBe(200);

    const secondPage = await secondResponse.json();
    expect(secondPage.items.length).toBe(1);
    expect(secondPage.items[0].status).toBe('ENDED');
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('returns resident leases including ended leases', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const oldOccupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ENDED',
      },
    });
    const activeOccupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: oldOccupancy.id,
        status: 'ENDED',
        leaseStartDate: new Date('2024-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2025-01-01T00:00:00.000Z'),
        annualRent: '100000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });
    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: activeOccupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-02-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-02-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '6000.00',
      },
    });

    const response = await fetch(`${baseUrl}/org/residents/${user.id}/leases`, {
      headers: { 'x-user-id': user.id },
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(2);
    expect(body.items[0].status).toBe('ACTIVE');
    expect(body.items[1].status).toBe('ENDED');
  });

  it('returns resident leases with status filter', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ENDED',
      },
    });
    await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ENDED',
        leaseStartDate: new Date('2024-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2025-01-01T00:00:00.000Z'),
        annualRent: '100000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    const response = await fetch(
      `${baseUrl}/org/residents/${user.id}/leases?status=ENDED`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].status).toBe('ENDED');
  });

  it('returns resident lease timeline across active and ended leases', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const endedOccupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ENDED',
      },
    });
    const activeOccupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
      },
    });

    const endedLease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: endedOccupancy.id,
        status: 'ENDED',
        leaseStartDate: new Date('2024-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2025-01-01T00:00:00.000Z'),
        annualRent: '100000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });
    const activeLease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: activeOccupancy.id,
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-02-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-02-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '6000.00',
      },
    });

    await prisma.leaseHistory.create({
      data: {
        orgId: org.id,
        leaseId: endedLease.id,
        action: 'CREATED',
        changedByUserId: user.id,
        changes: {},
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    });
    await prisma.leaseHistory.create({
      data: {
        orgId: org.id,
        leaseId: endedLease.id,
        action: 'MOVED_OUT',
        changedByUserId: user.id,
        changes: {},
        createdAt: new Date('2025-12-15T00:00:00.000Z'),
      },
    });
    await prisma.leaseHistory.create({
      data: {
        orgId: org.id,
        leaseId: activeLease.id,
        action: 'CREATED',
        changedByUserId: user.id,
        changes: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const response = await fetch(
      `${baseUrl}/org/residents/${user.id}/leases/timeline?limit=2`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(response.status).toBe(200);

    const firstPage = await response.json();
    expect(firstPage.items.length).toBe(2);
    expect(firstPage.items[0].action).toBe('CREATED');
    expect(firstPage.items[0].leaseId).toBe(activeLease.id);
    expect(firstPage.items[0].lease.id).toBe(activeLease.id);
    expect(firstPage.items[1].action).toBe('MOVED_OUT');
    expect(firstPage.items[1].leaseId).toBe(endedLease.id);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondResponse = await fetch(
      `${baseUrl}/org/residents/${user.id}/leases/timeline?limit=2&cursor=${encodeURIComponent(
        firstPage.nextCursor,
      )}`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(secondResponse.status).toBe(200);

    const secondPage = await secondResponse.json();
    expect(secondPage.items.length).toBe(1);
    expect(secondPage.items[0].action).toBe('CREATED');
    expect(secondPage.items[0].leaseId).toBe(endedLease.id);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('returns resident lease timeline with action filter', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const occupancy = await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ENDED',
      },
    });

    const lease = await prisma.lease.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        unitId: unit.id,
        occupancyId: occupancy.id,
        status: 'ENDED',
        leaseStartDate: new Date('2024-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2025-01-01T00:00:00.000Z'),
        annualRent: '100000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });

    await prisma.leaseHistory.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'UPDATED',
        changedByUserId: user.id,
        changes: { notes: { from: null, to: 'updated' } },
        createdAt: new Date('2025-01-15T00:00:00.000Z'),
      },
    });
    await prisma.leaseHistory.create({
      data: {
        orgId: org.id,
        leaseId: lease.id,
        action: 'MOVED_OUT',
        changedByUserId: user.id,
        changes: {},
        createdAt: new Date('2025-12-15T00:00:00.000Z'),
      },
    });

    const response = await fetch(
      `${baseUrl}/org/residents/${user.id}/leases/timeline?action=MOVED_OUT`,
      {
        headers: { 'x-user-id': user.id },
      },
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].action).toBe('MOVED_OUT');
  });

  it('returns 404 when resident is outside org', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const outsider = await prisma.user.create({
      data: {
        email: 'outsider@org.test',
        orgId: randomUUID(),
        isActive: true,
      },
    });

    const response = await fetch(
      `${baseUrl}/org/residents/${outsider.id}/leases`,
      {
        headers: { 'x-user-id': user.id },
      },
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 timeline when resident is outside org', async () => {
    permissionsByUser.set(user.id, new Set(['leases.read']));

    const outsider = await prisma.user.create({
      data: {
        email: 'outsider-timeline@org.test',
        orgId: randomUUID(),
        isActive: true,
      },
    });

    const response = await fetch(
      `${baseUrl}/org/residents/${outsider.id}/leases/timeline`,
      {
        headers: { 'x-user-id': user.id },
      },
    );

    expect(response.status).toBe(404);
  });
});

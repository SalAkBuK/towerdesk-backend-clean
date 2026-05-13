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
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { LeaseLifecycleController } from '../src/modules/leases/lease-lifecycle.controller';
import { LeaseLifecycleService } from '../src/modules/leases/lease-lifecycle.service';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { LeasesRepo } from '../src/modules/leases/leases.repo';
import { LeaseActivityRepo } from '../src/modules/leases/lease-activity.repo';
import { LeaseHistoryRepo } from '../src/modules/leases/lease-history.repo';
import { LeaseDocumentsRepo } from '../src/modules/leases/lease-documents.repo';
import { LeaseAccessCardsRepo } from '../src/modules/leases/lease-access-cards.repo';
import { LeaseParkingStickersRepo } from '../src/modules/leases/lease-parking-stickers.repo';
import { LeaseOccupantsRepo } from '../src/modules/leases/lease-occupants.repo';
import { ResidentProfilesRepo } from '../src/modules/residents/resident-profiles.repo';
import { ParkingRepo } from '../src/modules/parking/parking.repo';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type OrgRecord = { id: string; name: string };
type BuildingRecord = { id: string; orgId: string; name: string };
type UnitRecord = {
  id: string;
  buildingId: string;
  orgId: string;
  label: string;
};
type UserRecord = {
  id: string;
  email: string;
  orgId: string;
  isActive: boolean;
};
type RoleRecord = { id: string; orgId: string; key: string };
type UserRoleRecord = { userId: string; roleId: string };
type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
  startAt: Date;
  endAt: Date | null;
};
type LeaseRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId: string;
  occupancyId: string;
  status: 'ACTIVE' | 'ENDED';
  securityDepositAmount: string;
  totalDeductions?: string | null;
};
type ParkingAllocationRecord = {
  id: string;
  orgId: string;
  occupancyId: string | null;
  buildingId: string;
  endDate: Date | null;
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
  action: string;
  source: 'USER' | 'SYSTEM';
  changedByUserId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

class InMemoryPrismaService {
  orgs: OrgRecord[] = [];
  buildings: BuildingRecord[] = [];
  units: UnitRecord[] = [];
  users: UserRecord[] = [];
  roles: RoleRecord[] = [];
  userRoles: UserRoleRecord[] = [];
  occupancies: OccupancyRecord[] = [];
  leases: LeaseRecord[] = [];
  leaseAccessCards: {
    id: string;
    leaseId: string;
    status: string;
    returnedAt: Date | null;
  }[] = [];
  leaseParkingStickers: {
    id: string;
    leaseId: string;
    status: string;
    returnedAt: Date | null;
  }[] = [];
  leaseDocuments: any[] = [];
  leaseOccupants: any[] = [];
  residentProfiles: any[] = [];
  parkingAllocations: ParkingAllocationRecord[] = [];
  leaseHistories: LeaseHistoryRecord[] = [];
  leaseActivities: LeaseActivityRecord[] = [];

  $transaction = async <T>(cb: (tx: this) => Promise<T>) => {
    const tx = this.clone();
    try {
      const result = await cb(tx as this);
      this.copyFrom(tx);
      return result;
    } catch (error) {
      throw error;
    }
  };
  $queryRaw = async (sql?: TemplateStringsArray, ...values: any[]) => {
    const unitId = values[0];
    if (typeof unitId === 'string') {
      const unit = this.units.find((u) => u.id === unitId);
      return unit ? [{ id: unit.id }] : [];
    }
    return [];
  };

  private clone() {
    const tx = new InMemoryPrismaService();
    tx.orgs = this.orgs.map((o) => ({ ...o }));
    tx.buildings = this.buildings.map((b) => ({ ...b }));
    tx.units = this.units.map((u) => ({ ...u }));
    tx.users = this.users.map((u) => ({ ...u }));
    tx.roles = this.roles.map((r) => ({ ...r }));
    tx.userRoles = this.userRoles.map((ur) => ({ ...ur }));
    tx.occupancies = this.occupancies.map((o) => ({ ...o }));
    tx.leases = this.leases.map((l) => ({ ...l }));
    tx.leaseAccessCards = this.leaseAccessCards.map((c) => ({ ...c }));
    tx.leaseParkingStickers = this.leaseParkingStickers.map((s) => ({ ...s }));
    tx.leaseDocuments = this.leaseDocuments.map((d) => ({ ...d }));
    tx.leaseOccupants = this.leaseOccupants.map((o) => ({ ...o }));
    tx.residentProfiles = this.residentProfiles.map((p) => ({ ...p }));
    tx.parkingAllocations = this.parkingAllocations.map((a) => ({ ...a }));
    tx.leaseHistories = this.leaseHistories.map((h) => ({ ...h }));
    tx.leaseActivities = this.leaseActivities.map((a) => ({ ...a }));
    return tx;
  }

  private copyFrom(tx: InMemoryPrismaService) {
    this.orgs = tx.orgs;
    this.buildings = tx.buildings;
    this.units = tx.units;
    this.users = tx.users;
    this.roles = tx.roles;
    this.userRoles = tx.userRoles;
    this.occupancies = tx.occupancies;
    this.leases = tx.leases;
    this.leaseAccessCards = tx.leaseAccessCards;
    this.leaseParkingStickers = tx.leaseParkingStickers;
    this.leaseDocuments = tx.leaseDocuments;
    this.leaseOccupants = tx.leaseOccupants;
    this.residentProfiles = tx.residentProfiles;
    this.parkingAllocations = tx.parkingAllocations;
    this.leaseHistories = tx.leaseHistories;
    this.leaseActivities = tx.leaseActivities;
  }

  user = {
    findFirst: async ({
      where,
    }: {
      where: Partial<UserRecord> & { email?: { equals: string; mode: string } };
    }) => {
      if (where.email && typeof where.email === 'object') {
        return (
          this.users.find(
            (u) =>
              u.email.toLowerCase() === where.email?.equals.toLowerCase() &&
              (where.orgId ? u.orgId === where.orgId : true) &&
              (where.isActive === undefined
                ? true
                : u.isActive === where.isActive),
          ) ?? null
        );
      }
      return (
        this.users.find(
          (u) =>
            (where.id ? u.id === where.id : true) &&
            (where.orgId ? u.orgId === where.orgId : true) &&
            (where.isActive === undefined
              ? true
              : u.isActive === where.isActive),
        ) ?? null
      );
    },
    create: async ({ data }: { data: Partial<UserRecord> }) => {
      const user: UserRecord = {
        id: data.id ?? randomUUID(),
        email: data.email as string,
        orgId: data.orgId as string,
        isActive: true,
      };
      this.users.push(user);
      return user;
    },
  };

  role = {
    findFirst: async ({ where }: { where: Partial<RoleRecord> }) => {
      return (
        this.roles.find(
          (r) =>
            (where.id ? r.id === where.id : true) &&
            (where.orgId ? r.orgId === where.orgId : true) &&
            (where.key ? r.key === where.key : true),
        ) ?? null
      );
    },
    create: async ({ data }: { data: Partial<RoleRecord> }) => {
      const role: RoleRecord = {
        id: data.id ?? randomUUID(),
        orgId: data.orgId as string,
        key: data.key as string,
      };
      this.roles.push(role);
      return role;
    },
  };

  userRole = {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: UserRoleRecord[];
      skipDuplicates?: boolean;
    }) => {
      let count = 0;
      for (const item of data) {
        const exists = this.userRoles.some(
          (ur) => ur.userId === item.userId && ur.roleId === item.roleId,
        );
        if (exists && skipDuplicates) continue;
        if (!exists) {
          this.userRoles.push({ userId: item.userId, roleId: item.roleId });
          count += 1;
        }
      }
      return { count };
    },
  };

  org = {
    findFirst: async ({ where }: { where: Partial<OrgRecord> }) => {
      return (
        this.orgs.find(
          (o) =>
            (where.id ? o.id === where.id : true) &&
            (where.name ? o.name === where.name : true),
        ) ?? null
      );
    },
    create: async ({ data }: { data: { name: string } }) => {
      const org: OrgRecord = { id: randomUUID(), name: data.name };
      this.orgs.push(org);
      return org;
    },
  };

  building = {
    findFirst: async ({ where }: { where: Partial<BuildingRecord> }) => {
      return (
        this.buildings.find(
          (b) =>
            (where.id ? b.id === where.id : true) &&
            (where.orgId ? b.orgId === where.orgId : true),
        ) ?? null
      );
    },
    create: async ({ data }: { data: { orgId: string; name: string } }) => {
      const building: BuildingRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        name: data.name,
      };
      this.buildings.push(building);
      return building;
    },
  };

  unit = {
    findFirst: async ({ where }: { where: Partial<UnitRecord> }) => {
      return (
        this.units.find(
          (u) =>
            (where.id ? u.id === where.id : true) &&
            (where.buildingId ? u.buildingId === where.buildingId : true),
        ) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: { buildingId: string; orgId: string; label: string };
    }) => {
      const unit: UnitRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        orgId: data.orgId,
        label: data.label,
      };
      this.units.push(unit);
      return unit;
    },
  };

  occupancy = {
    findFirst: async ({ where }: { where: Partial<OccupancyRecord> }) => {
      return (
        this.occupancies.find(
          (o) =>
            (where.unitId ? o.unitId === where.unitId : true) &&
            (where.residentUserId
              ? o.residentUserId === where.residentUserId
              : true) &&
            (where.status ? o.status === where.status : true),
        ) ?? null
      );
    },
    create: async ({ data }: { data: Partial<OccupancyRecord> }) => {
      const occ: OccupancyRecord = {
        id: randomUUID(),
        buildingId: data.buildingId as string,
        unitId: data.unitId as string,
        residentUserId: data.residentUserId as string,
        status: (data.status as any) ?? 'ACTIVE',
        startAt: (data.startAt as Date) ?? new Date(),
        endAt: data.endAt ?? null,
      };
      this.occupancies.push(occ);
      return occ;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Partial<OccupancyRecord>;
      data: Partial<OccupancyRecord>;
    }) => {
      let count = 0;
      for (const occ of this.occupancies) {
        if (where.id && occ.id !== where.id) continue;
        Object.assign(occ, data);
        count += 1;
      }
      return { count };
    },
  };

  lease = {
    findFirst: async ({ where }: { where: Partial<LeaseRecord> }) => {
      return (
        this.leases.find(
          (l) =>
            (where.id ? l.id === where.id : true) &&
            (where.orgId ? l.orgId === where.orgId : true) &&
            (where.buildingId ? l.buildingId === where.buildingId : true),
        ) ?? null
      );
    },
    create: async ({ data }: { data: Partial<LeaseRecord> }) => {
      const lease: LeaseRecord = {
        id: data.id ?? randomUUID(),
        orgId: data.orgId as string,
        buildingId: data.buildingId as string,
        unitId: data.unitId as string,
        occupancyId: data.occupancyId as string,
        status: (data.status as any) ?? 'ACTIVE',
        securityDepositAmount:
          (data.securityDepositAmount as any)?.toString() ?? '0',
        totalDeductions: data.totalDeductions?.toString() ?? null,
      };
      this.leases.push(lease);
      return lease;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<LeaseRecord>;
    }) => {
      const lease = this.leases.find((l) => l.id === where.id);
      if (!lease) throw new Error('Lease not found');
      Object.assign(lease, data);
      return lease;
    },
  };

  leaseAccessCard = {
    updateMany: async ({
      where,
      data,
    }: {
      where: { leaseId: string; status?: string };
      data: any;
    }) => {
      for (const card of this.leaseAccessCards) {
        if (
          card.leaseId === where.leaseId &&
          (!where.status || card.status === where.status)
        ) {
          card.status = data.status ?? card.status;
          card.returnedAt = data.returnedAt ?? card.returnedAt;
        }
      }
      return { count: 0 };
    },
  };

  leaseParkingSticker = {
    updateMany: async ({
      where,
      data,
    }: {
      where: { leaseId: string; status?: string };
      data: any;
    }) => {
      for (const st of this.leaseParkingStickers) {
        if (
          st.leaseId === where.leaseId &&
          (!where.status || st.status === where.status)
        ) {
          st.status = data.status ?? st.status;
          st.returnedAt = data.returnedAt ?? st.returnedAt;
        }
      }
      return { count: 0 };
    },
  };

  leaseDocument = {
    create: async ({ data }: { data: any }) => {
      this.leaseDocuments.push({
        ...data,
        id: randomUUID(),
        createdAt: new Date(),
      });
      return data;
    },
  };

  leaseOccupant = {
    deleteMany: async ({ where }: { where: { leaseId: string } }) => {
      this.leaseOccupants = this.leaseOccupants.filter(
        (o) => o.leaseId !== where.leaseId,
      );
      return { count: 0 };
    },
    createMany: async ({ data }: { data: any[] }) => {
      for (const item of data) {
        this.leaseOccupants.push({
          ...item,
          id: randomUUID(),
          createdAt: new Date(),
        });
      }
      return { count: data.length };
    },
    findMany: async ({ where }: { where: { leaseId: string } }) => {
      return this.leaseOccupants.filter((o) => o.leaseId === where.leaseId);
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
      };
    }) => {
      const row: LeaseHistoryRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        changedByUserId: data.changedByUserId ?? null,
        changes: data.changes,
        createdAt: new Date(),
      };
      this.leaseHistories.push(row);
      return row;
    },
  };

  leaseActivity = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        leaseId: string;
        action: string;
        source?: 'USER' | 'SYSTEM';
        changedByUserId?: string | null;
        payload: Record<string, unknown>;
      };
    }) => {
      const row: LeaseActivityRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        source: data.source ?? 'USER',
        changedByUserId: data.changedByUserId ?? null,
        payload: data.payload,
        createdAt: new Date(),
      };
      this.leaseActivities.push(row);
      return row;
    },
  };

  residentProfile = {
    upsert: async ({ where, create, update }: any) => {
      const existing = this.residentProfiles.find(
        (p) => p.userId === where.userId,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const record = {
        ...create,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.residentProfiles.push(record);
      return record;
    },
  };

  parkingAllocation = {
    updateMany: async ({ where, data }: { where: any; data: any }) => {
      let count = 0;
      for (const alloc of this.parkingAllocations) {
        if (where.occupancyId && alloc.occupancyId !== where.occupancyId)
          continue;
        if (where.orgId && alloc.orgId !== where.orgId) continue;
        if (where.endDate === null && alloc.endDate !== null) continue;
        alloc.endDate = data.endDate ?? alloc.endDate;
        count += 1;
      }
      return { count };
    },
    createMany: async ({ data }: { data: any[] }) => {
      for (const item of data) {
        this.parkingAllocations.push({
          id: randomUUID(),
          orgId: item.orgId,
          occupancyId: item.occupancyId ?? null,
          buildingId: item.buildingId,
          endDate: item.endDate,
        });
      }
      return { count: data.length };
    },
    findMany: async ({ where }: { where: any }) => {
      return this.parkingAllocations.filter(
        (a) =>
          (where.parkingSlotId?.in
            ? where.parkingSlotId.in.includes(a.id)
            : true) && (where.endDate === null ? a.endDate === null : true),
      );
    },
  };
}

let prisma: InMemoryPrismaService;

@Injectable()
class TestAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    const user = await prisma.user.findFirst({ where: { id: userId } });
    if (!user) return false;
    request.user = { sub: user.id, email: user.email, orgId: user.orgId };
    return true;
  }
}

@Injectable()
class AllowBuildingGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('Lease move-in/out (integration)', () => {
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
      controllers: [LeaseLifecycleController],
      providers: [
        LeaseLifecycleService,
        BuildingsRepo,
        UnitsRepo,
        LeasesRepo,
        LeaseHistoryRepo,
        LeaseActivityRepo,
        LeaseDocumentsRepo,
        LeaseAccessCardsRepo,
        LeaseParkingStickersRepo,
        LeaseOccupantsRepo,
        ResidentProfilesRepo,
        ParkingRepo,
        OrgScopeGuard,
        PermissionsGuard,
        {
          provide: BuildingScopeResolverService,
          useValue: {
            resolveForRequest: async () => undefined,
          },
        },
        // BuildingAccessGuard,
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
      .overrideGuard(BuildingAccessGuard)
      .useClass(AllowBuildingGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    prisma = app.get(PrismaService) as unknown as InMemoryPrismaService;
    prisma.orgs = [];
    prisma.users = [];
    prisma.buildings = [];
    prisma.units = [];
    prisma.occupancies = [];
    prisma.leases = [];
    prisma.leaseAccessCards = [];
    prisma.leaseParkingStickers = [];
    prisma.leaseDocuments = [];
    prisma.leaseOccupants = [];
    prisma.residentProfiles = [];
    prisma.parkingAllocations = [];
    prisma.leaseHistories = [];
    prisma.leaseActivities = [];
    prisma.roles = [];
    prisma.userRoles = [];
    permissionsByUser.clear();

    org = await prisma.org.create({ data: { name: 'Org A' } });
    user = await prisma.user.create({
      data: { email: 'admin@org.test', orgId: org.id, isActive: true },
    });
    building = await prisma.building.create({
      data: { orgId: org.id, name: 'Building A' },
    });
    unit = await prisma.unit.create({
      data: { buildingId: building.id, orgId: org.id, label: '101' },
    });
  });

  it('requires move_in permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/move-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          unitId: unit.id,
          resident: { name: 'Alice', email: 'alice@test.com' },
          leaseStartDate: new Date().toISOString(),
          leaseEndDate: new Date(Date.now() + 86400000).toISOString(),
          annualRent: '100000',
          paymentFrequency: 'ANNUAL',
          securityDepositAmount: '5000',
        }),
      },
    );
    expect(response.status).toBe(403);
  });

  it('performs move-in and move-out', async () => {
    permissionsByUser.set(
      user.id,
      new Set(['leases.move_in', 'leases.move_out']),
    );

    const start = new Date().toISOString();
    const end = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const moveIn = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/move-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          unitId: unit.id,
          resident: { name: 'Alice', email: 'alice@test.com' },
          leaseStartDate: start,
          leaseEndDate: end,
          annualRent: '100000',
          paymentFrequency: 'ANNUAL',
          securityDepositAmount: '5000',
          occupantNames: ['Alice'],
        }),
      },
    );

    expect(moveIn.status).toBe(200);
    const moveInBody = await moveIn.json();
    const leaseId = moveInBody.id;
    expect(moveInBody.status).toBe('ACTIVE');

    const moveOut = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/${leaseId}/move-out`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          actualMoveOutDate: new Date().toISOString(),
          totalDeductions: '1000',
        }),
      },
    );

    expect(moveOut.status).toBe(200);
    const moveOutBody = await moveOut.json();
    expect(moveOutBody.status).toBe('ENDED');
  });

  it('prevents second move-in for occupied unit', async () => {
    permissionsByUser.set(user.id, new Set(['leases.move_in']));

    const body = {
      unitId: unit.id,
      resident: { name: 'Alice', email: 'alice@test.com' },
      leaseStartDate: new Date().toISOString(),
      leaseEndDate: new Date(Date.now() + 86400000).toISOString(),
      annualRent: '100000',
      paymentFrequency: 'ANNUAL',
      securityDepositAmount: '5000',
    };

    const first = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/move-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify(body),
      },
    );
    expect(first.status).toBe(200);

    const second = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/move-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          ...body,
          resident: { name: 'Bob', email: 'bob@test.com' },
        }),
      },
    );
    expect(second.status).toBe(409);
  });

  it('assigns resident role for newly created resident', async () => {
    permissionsByUser.set(user.id, new Set(['leases.move_in']));
    const residentRole = await prisma.role.create({
      data: { orgId: org.id, key: 'resident' },
    });

    const response = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/move-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          unitId: unit.id,
          resident: { name: 'Alice', email: 'alice@test.com' },
          leaseStartDate: new Date().toISOString(),
          leaseEndDate: new Date(Date.now() + 86400000).toISOString(),
          annualRent: '100000',
          paymentFrequency: 'ANNUAL',
          securityDepositAmount: '5000',
        }),
      },
    );

    expect(response.status).toBe(200);
    const createdUser = prisma.users.find((u) => u.email === 'alice@test.com');
    expect(createdUser).toBeDefined();
    expect(
      prisma.occupancies.some(
        (occupancy) => occupancy.residentUserId === createdUser?.id,
      ),
    ).toBe(true);
  });

  it('assigns resident role for existing resident user', async () => {
    permissionsByUser.set(user.id, new Set(['leases.move_in']));
    const residentRole = await prisma.role.create({
      data: { orgId: org.id, key: 'resident' },
    });
    const residentUser = await prisma.user.create({
      data: { email: 'existing@test.com', orgId: org.id, isActive: true },
    });

    const response = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/move-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          unitId: unit.id,
          residentUserId: residentUser.id,
          leaseStartDate: new Date().toISOString(),
          leaseEndDate: new Date(Date.now() + 86400000).toISOString(),
          annualRent: '100000',
          paymentFrequency: 'ANNUAL',
          securityDepositAmount: '5000',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(
      prisma.occupancies.some(
        (occupancy) => occupancy.residentUserId === residentUser.id,
      ),
    ).toBe(true);
  });

  it('does not create partial records when move-in conflicts', async () => {
    permissionsByUser.set(user.id, new Set(['leases.move_in']));

    await prisma.occupancy.create({
      data: {
        buildingId: building.id,
        unitId: unit.id,
        residentUserId: user.id,
        status: 'ACTIVE',
        endAt: null,
      },
    });

    const beforeUsers = prisma.users.length;
    const beforeOccupancies = prisma.occupancies.length;
    const beforeLeases = prisma.leases.length;

    const response = await fetch(
      `${baseUrl}/org/buildings/${building.id}/leases/move-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          unitId: unit.id,
          resident: { name: 'New Tenant', email: 'newtenant@test.com' },
          leaseStartDate: new Date().toISOString(),
          leaseEndDate: new Date(Date.now() + 86400000).toISOString(),
          annualRent: '100000',
          paymentFrequency: 'ANNUAL',
          securityDepositAmount: '5000',
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(prisma.users.length).toBe(beforeUsers);
    expect(prisma.occupancies.length).toBe(beforeOccupancies);
    expect(prisma.leases.length).toBe(beforeLeases);
    const newUser = prisma.users.find((u) => u.email === 'newtenant@test.com');
    expect(newUser).toBeUndefined();
  });
});

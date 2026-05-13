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
import { ResidentDirectoryController } from '../src/modules/residents/resident-directory.controller';
import { ResidentsService } from '../src/modules/residents/residents.service';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { OrgUserLifecycleService } from '../src/modules/users/org-user-lifecycle.service';

type OrgRecord = { id: string; name: string };
type BuildingRecord = { id: string; orgId: string; name: string };
type UnitRecord = { id: string; buildingId: string; label: string };
type UserRecord = {
  id: string;
  email: string;
  orgId: string;
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
};
type ResidentProfileRecord = {
  id: string;
  orgId: string;
  userId: string;
  nationality?: string | null;
};
type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
  startAt: Date;
  endAt?: Date | null;
  createdAt: Date;
};
type LeaseRecord = {
  id: string;
  occupancyId: string;
  status: 'ACTIVE' | 'ENDED';
  leaseStartDate: Date;
  leaseEndDate: Date;
  annualRent?: string | null;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  orgs: OrgRecord[] = [];
  buildings: BuildingRecord[] = [];
  units: UnitRecord[] = [];
  users: UserRecord[] = [];
  profiles: ResidentProfileRecord[] = [];
  occupancies: OccupancyRecord[] = [];
  leases: LeaseRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const org: OrgRecord = { id: randomUUID(), name: data.name };
      this.orgs.push(org);
      return org;
    },
  };

  building = {
    create: async ({ data }: { data: { orgId: string; name: string } }) => {
      const building: BuildingRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        name: data.name,
      };
      this.buildings.push(building);
      return building;
    },
    findFirst: async ({ where }: { where: { id: string; orgId: string } }) => {
      return (
        this.buildings.find(
          (b) => b.id === where.id && b.orgId === where.orgId,
        ) ?? null
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
      where: { id: string; buildingId: string };
    }) => {
      return (
        this.units.find(
          (u) => u.id === where.id && u.buildingId === where.buildingId,
        ) ?? null
      );
    },
  };

  user = {
    create: async ({
      data,
    }: {
      data: { email: string; orgId: string; name?: string | null };
    }) => {
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        name: data.name ?? null,
        phone: null,
        avatarUrl: null,
      };
      this.users.push(user);
      return user;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((u) => u.id === where.id) ?? null;
    },
  };

  residentProfile = {
    upsert: async ({ create }: { create: ResidentProfileRecord }) => {
      const profile: ResidentProfileRecord = {
        ...create,
        id: randomUUID(),
      };
      this.profiles.push(profile);
      return profile;
    },
  };

  occupancy = {
    findMany: async ({ where, include, orderBy, take }: any) => {
      let results = this.occupancies.filter((occ) => {
        if (occ.buildingId !== where.buildingId) return false;
        if (where.status && occ.status !== where.status) return false;
        if (where.OR) {
          const ok = where.OR.some((clause: any) => {
            if (clause.residentUser?.name?.contains) {
              const user = this.users.find((u) => u.id === occ.residentUserId);
              return user?.name
                ?.toLowerCase()
                .includes(clause.residentUser.name.contains.toLowerCase());
            }
            if (clause.residentUser?.email?.contains) {
              const user = this.users.find((u) => u.id === occ.residentUserId);
              return user?.email
                .toLowerCase()
                .includes(clause.residentUser.email.contains.toLowerCase());
            }
            if (clause.unit?.label?.contains) {
              const unit = this.units.find((u) => u.id === occ.unitId);
              return unit?.label
                .toLowerCase()
                .includes(clause.unit.label.contains.toLowerCase());
            }
            return false;
          });
          if (!ok) return false;
        }
        return true;
      });

      if (where.AND && Array.isArray(where.AND)) {
        const clause = where.AND[0];
        if (clause?.OR && Array.isArray(clause.OR)) {
          results = results.filter((occ) => {
            return clause.OR.some((condition: any) => {
              if (condition.residentUser?.name) {
                const user =
                  this.users.find((u) => u.id === occ.residentUserId) ?? null;
                const compare = condition.residentUser.name;
                const name = (user?.name ?? '').toString();
                if (compare.lt) return name < compare.lt;
                if (compare.gt) return name > compare.gt;
                return name === compare;
              }
              if (condition.unit?.label) {
                const unit =
                  this.units.find((u) => u.id === occ.unitId) ?? null;
                const compare = condition.unit.label;
                const label = (unit?.label ?? '').toString();
                if (compare.lt) return label < compare.lt;
                if (compare.gt) return label > compare.gt;
                return label === compare;
              }
              if (condition.createdAt) {
                const compare = condition.createdAt;
                const value = occ.createdAt;
                if (compare.lt) return value < new Date(compare.lt);
                if (compare.gt) return value > new Date(compare.gt);
                return value.getTime() === new Date(compare).getTime();
              }
              if (condition.startAt) {
                const compare = condition.startAt;
                const value = occ.startAt;
                if (compare.lt) return value < new Date(compare.lt);
                if (compare.gt) return value > new Date(compare.gt);
                return value.getTime() === new Date(compare).getTime();
              }
              if (condition.AND) {
                const [eqClause, idClause] = condition.AND;
                if (idClause?.id) {
                  const op = idClause.id.lt ? 'lt' : idClause.id.gt ? 'gt' : '';
                  if (op === 'lt' && occ.id >= idClause.id.lt) return false;
                  if (op === 'gt' && occ.id <= idClause.id.gt) return false;
                }
                if (eqClause?.residentUser?.name) {
                  const user =
                    this.users.find((u) => u.id === occ.residentUserId) ?? null;
                  const name = (user?.name ?? '').toString();
                  return name === eqClause.residentUser.name;
                }
                if (eqClause?.unit?.label) {
                  const unit =
                    this.units.find((u) => u.id === occ.unitId) ?? null;
                  const label = (unit?.label ?? '').toString();
                  return label === eqClause.unit.label;
                }
                if (eqClause?.createdAt) {
                  return (
                    occ.createdAt.getTime() ===
                    new Date(eqClause.createdAt).getTime()
                  );
                }
                if (eqClause?.startAt) {
                  return (
                    occ.startAt.getTime() ===
                    new Date(eqClause.startAt).getTime()
                  );
                }
              }
              return false;
            });
          });
        }
      }

      const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
      if (order?.createdAt) {
        results.sort((a, b) =>
          order.createdAt === 'asc'
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime(),
        );
      } else if (order?.startAt) {
        results.sort((a, b) =>
          order.startAt === 'asc'
            ? a.startAt.getTime() - b.startAt.getTime()
            : b.startAt.getTime() - a.startAt.getTime(),
        );
      } else if (order?.residentUser?.name) {
        results.sort((a, b) => {
          const aName =
            this.users.find((u) => u.id === a.residentUserId)?.name ?? '';
          const bName =
            this.users.find((u) => u.id === b.residentUserId)?.name ?? '';
          return order.residentUser.name === 'asc'
            ? aName.localeCompare(bName)
            : bName.localeCompare(aName);
        });
      } else if (order?.unit?.label) {
        results.sort((a, b) => {
          const aLabel = this.units.find((u) => u.id === a.unitId)?.label ?? '';
          const bLabel = this.units.find((u) => u.id === b.unitId)?.label ?? '';
          return order.unit.label === 'asc'
            ? aLabel.localeCompare(bLabel)
            : bLabel.localeCompare(aLabel);
        });
      }

      if (typeof take === 'number') {
        results = results.slice(0, take);
      }

      if (!include) return results;
      return results.map((occ) => {
        const unit = this.units.find((u) => u.id === occ.unitId) ?? null;
        const residentUser =
          this.users.find((u) => u.id === occ.residentUserId) ?? null;
        const lease = this.leases.find((l) => l.occupancyId === occ.id) ?? null;
        const profile =
          this.profiles.find((p) => p.userId === occ.residentUserId) ?? null;
        return {
          ...occ,
          unit: include.unit ? unit : undefined,
          residentUser: include.residentUser
            ? {
                ...residentUser,
                residentProfile: profile,
              }
            : undefined,
          lease: include.lease ? lease : undefined,
        };
      });
    },
  };

  lease = {
    findMany: async ({ where, orderBy }: any) => {
      let rows = this.leases
        .map((lease) => {
          const occupancy =
            this.occupancies.find((occ) => occ.id === lease.occupancyId) ??
            null;
          if (!occupancy) {
            return null;
          }
          return {
            id: lease.id,
            status: lease.status,
            residentUserId: occupancy.residentUserId,
            leaseStartDate: lease.leaseStartDate,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (where?.residentUserId?.in) {
        const residentIds = new Set(where.residentUserId.in as string[]);
        rows = rows.filter((item) => residentIds.has(item.residentUserId));
      }

      if (Array.isArray(orderBy) && orderBy[0]?.leaseStartDate) {
        const direction = orderBy[0].leaseStartDate === 'asc' ? 1 : -1;
        rows.sort(
          (a, b) =>
            direction *
            (a.leaseStartDate.getTime() - b.leaseStartDate.getTime()),
        );
      }

      return rows;
    },
  };
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

describe('Resident directory (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let org: OrgRecord;
  let building: BuildingRecord;
  let user: UserRecord;

  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [ResidentDirectoryController],
      providers: [
        ResidentsService,
        BuildingsRepo,
        UnitsRepo,
        OrgScopeGuard,
        PermissionsGuard,
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
        {
          provide: AuthService,
          useValue: {
            requestPasswordReset: jest
              .fn()
              .mockResolvedValue({ success: true }),
          },
        },
        {
          provide: OrgUserLifecycleService,
          useValue: {
            provisionOrgUser: jest.fn(),
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
    prisma.buildings = [];
    prisma.units = [];
    prisma.users = [];
    prisma.profiles = [];
    prisma.occupancies = [];
    prisma.leases = [];
    permissionsByUser.clear();

    org = await prisma.org.create({ data: { name: 'Org A' } });
    building = await prisma.building.create({
      data: { orgId: org.id, name: 'Building A' },
    });
    user = await prisma.user.create({
      data: { email: 'admin@org.test', orgId: org.id, name: 'Admin' },
    });

    const unitA = await prisma.unit.create({
      data: { buildingId: building.id, label: 'A-101' },
    });
    const unitB = await prisma.unit.create({
      data: { buildingId: building.id, label: 'B-201' },
    });

    const alice = await prisma.user.create({
      data: { email: 'alice@org.test', orgId: org.id, name: 'Alice' },
    });
    const bob = await prisma.user.create({
      data: { email: 'bob@org.test', orgId: org.id, name: 'Bob' },
    });

    const occA: OccupancyRecord = {
      id: randomUUID(),
      buildingId: building.id,
      unitId: unitA.id,
      residentUserId: alice.id,
      status: 'ACTIVE',
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const occB: OccupancyRecord = {
      id: randomUUID(),
      buildingId: building.id,
      unitId: unitB.id,
      residentUserId: bob.id,
      status: 'ACTIVE',
      startAt: new Date('2026-01-02T00:00:00.000Z'),
      endAt: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    prisma.occupancies.push(occA, occB);

    prisma.leases.push({
      id: randomUUID(),
      occupancyId: occA.id,
      status: 'ACTIVE',
      leaseStartDate: new Date('2026-01-01T00:00:00.000Z'),
      leaseEndDate: new Date('2027-01-01T00:00:00.000Z'),
      annualRent: '100000',
    });
  });

  it('supports residentName sorting and returns lease info when active', async () => {
    permissionsByUser.set(user.id, new Set(['residents.read']));

    const response = await fetch(
      `${baseUrl}/org/buildings/${building.id}/resident-directory?sort=residentName&order=asc&limit=1`,
      { headers: { 'x-user-id': user.id } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].residentName).toBe('Alice');
    expect(body.items[0].lease).toBeTruthy();
    expect(body.nextCursor).toBeTruthy();

    const next = await fetch(
      `${baseUrl}/org/buildings/${building.id}/resident-directory?sort=residentName&order=asc&limit=1&cursor=${encodeURIComponent(
        body.nextCursor ?? '',
      )}`,
      { headers: { 'x-user-id': user.id } },
    );

    expect(next.status).toBe(200);
    const nextBody = await next.json();
    expect(nextBody.items).toHaveLength(1);
    expect(nextBody.items[0].residentName).toBe('Bob');
  });
});

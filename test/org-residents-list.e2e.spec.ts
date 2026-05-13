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
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { OrgResidentsController } from '../src/modules/residents/org-residents.controller';
import { ResidentsService } from '../src/modules/residents/residents.service';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { OrgUserLifecycleService } from '../src/modules/users/org-user-lifecycle.service';

type OrgRecord = { id: string; name: string };
type RoleRecord = { id: string; orgId: string; key: string };
type UserRecord = {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  orgId: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
};
type UserRoleRecord = { userId: string; roleId: string };
type ResidentProfileRecord = {
  id: string;
  orgId: string;
  userId: string;
  nationality?: string | null;
};
type BuildingRecord = { id: string; name: string };
type UnitRecord = { id: string; label: string };
type OccupancyRecord = {
  id: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
  buildingId?: string;
  unitId?: string;
  endAt?: Date | null;
};

type ResidentInviteRecord = {
  id: string;
  orgId: string;
  userId: string;
  createdByUserId?: string | null;
  email: string;
  status: 'SENT' | 'FAILED' | 'ACCEPTED';
  tokenHash: string;
  expiresAt: Date;
  sentAt: Date;
  acceptedAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  orgs: OrgRecord[] = [];
  roles: RoleRecord[] = [];
  users: UserRecord[] = [];
  userRoles: UserRoleRecord[] = [];
  profiles: ResidentProfileRecord[] = [];
  occupancies: OccupancyRecord[] = [];
  residentInvites: ResidentInviteRecord[] = [];
  buildings: BuildingRecord[] = [];
  units: UnitRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const org: OrgRecord = { id: randomUUID(), name: data.name };
      this.orgs.push(org);
      return org;
    },
  };

  role = {
    findFirst: async ({ where }: { where: { key: string; orgId: string } }) => {
      return (
        this.roles.find(
          (r) => r.key === where.key && r.orgId === where.orgId,
        ) ?? null
      );
    },
    create: async ({ data }: { data: { key: string; orgId: string } }) => {
      const role: RoleRecord = {
        id: randomUUID(),
        key: data.key,
        orgId: data.orgId,
      };
      this.roles.push(role);
      return role;
    },
  };

  user = {
    create: async ({
      data,
    }: {
      data: {
        email: string;
        orgId: string;
        name?: string | null;
        isActive?: boolean;
        mustChangePassword?: boolean;
      };
    }) => {
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        name: data.name ?? null,
        phone: null,
        avatarUrl: null,
        orgId: data.orgId,
        isActive: data.isActive ?? true,
        mustChangePassword: data.mustChangePassword ?? true,
        createdAt: new Date(),
      };
      this.users.push(user);
      return user;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((u) => u.id === where.id) ?? null;
    },
    findFirst: async ({ where, select }: any) => {
      let results = [...this.users];
      if (where?.id) {
        results = results.filter((u) => u.id === where.id);
      }
      if (where?.orgId) {
        results = results.filter((u) => u.orgId === where.orgId);
      }
      if (where?.isActive !== undefined) {
        results = results.filter((u) => u.isActive === where.isActive);
      }
      if (where?.userRoles?.some?.role?.key) {
        const roleKey = where.userRoles.some.role.key;
        const roleOrgId = where.userRoles.some.role.orgId;
        const roleIds = this.roles
          .filter(
            (r) =>
              r.key === roleKey &&
              (roleOrgId === undefined ? true : r.orgId === roleOrgId),
          )
          .map((r) => r.id);
        const allowedUserIds = new Set(
          this.userRoles
            .filter((ur) => roleIds.includes(ur.roleId))
            .map((ur) => ur.userId),
        );
        results = results.filter((u) => allowedUserIds.has(u.id));
      }

      const user = results[0] ?? null;
      if (!user || !select) return user;
      return Object.fromEntries(
        Object.entries(select)
          .filter(([, include]) => include)
          .map(([key]) => [key, (user as any)[key]]),
      );
    },
    findMany: async ({ where, include, orderBy, take }: any) => {
      let results = this.users.filter((u) => u.orgId === where.orgId);
      if (where.userRoles?.some?.role?.key) {
        const roleKey = where.userRoles.some.role.key;
        const roleIds = this.roles
          .filter((r) => r.key === roleKey && r.orgId === where.orgId)
          .map((r) => r.id);
        const allowedUserIds = new Set(
          this.userRoles
            .filter((ur) => roleIds.includes(ur.roleId))
            .map((ur) => ur.userId),
        );
        results = results.filter((u) => allowedUserIds.has(u.id));
      }

      // Handle occupancy filters
      if (where.residentOccupancies) {
        const occ = where.residentOccupancies;
        if (occ.some?.status === 'ACTIVE') {
          // WITH_OCCUPANCY
          const active = new Set(
            this.occupancies
              .filter((o) => o.status === 'ACTIVE')
              .map((o) => o.residentUserId),
          );
          results = results.filter((u) => active.has(u.id));
        } else if (occ.none && Object.keys(occ.none).length === 0) {
          // NEW: { none: {} } — zero occupancy records at all
          const hasAny = new Set(this.occupancies.map((o) => o.residentUserId));
          results = results.filter((u) => !hasAny.has(u.id));
        } else if (occ.none?.status === 'ACTIVE') {
          // WITHOUT_OCCUPANCY
          const active = new Set(
            this.occupancies
              .filter((o) => o.status === 'ACTIVE')
              .map((o) => o.residentUserId),
          );
          results = results.filter((u) => !active.has(u.id));
        }
      }

      // Handle compound AND conditions (FORMER filter + cursor)
      if (Array.isArray(where.AND)) {
        for (const condition of where.AND) {
          if (
            condition.residentOccupancies?.some &&
            Object.keys(condition.residentOccupancies.some).length === 0
          ) {
            // { some: {} } — has at least one occupancy record
            const hasAny = new Set(
              this.occupancies.map((o) => o.residentUserId),
            );
            results = results.filter((u) => hasAny.has(u.id));
          }
          if (condition.residentOccupancies?.none?.status === 'ACTIVE') {
            // { none: { status: 'ACTIVE' } } — no active occupancy
            const active = new Set(
              this.occupancies
                .filter((o) => o.status === 'ACTIVE')
                .map((o) => o.residentUserId),
            );
            results = results.filter((u) => !active.has(u.id));
          }
        }
      }

      if (where.OR) {
        results = results.filter((u) =>
          where.OR.some((clause: any) => {
            if (clause.residentProfile?.isNot === null) {
              return this.profiles.some((profile) => profile.userId === u.id);
            }
            if (clause.residentOccupancies?.some) {
              return this.occupancies.some(
                (occupancy) => occupancy.residentUserId === u.id,
              );
            }
            if (clause.residentInvitesReceived?.some) {
              return this.residentInvites.some(
                (invite) => invite.userId === u.id,
              );
            }
            if (clause.name?.contains) {
              return (u.name ?? '')
                .toLowerCase()
                .includes(clause.name.contains.toLowerCase());
            }
            if (clause.email?.contains) {
              return u.email
                .toLowerCase()
                .includes(clause.email.contains.toLowerCase());
            }
            return false;
          }),
        );
      }
      if (orderBy?.length) {
        const [first] = orderBy;
        if (first.createdAt) {
          results.sort((a, b) =>
            first.createdAt === 'desc'
              ? b.createdAt.getTime() - a.createdAt.getTime()
              : a.createdAt.getTime() - b.createdAt.getTime(),
          );
        }
      }
      if (typeof take === 'number') {
        results = results.slice(0, take);
      }
      if (!include) return results;
      return results.map((u) => ({
        ...u,
        residentProfile: include.residentProfile
          ? (this.profiles.find((p) => p.userId === u.id) ?? null)
          : undefined,
        residentOccupancies: include.residentOccupancies
          ? this.occupancies
              .filter((o) => o.residentUserId === u.id)
              .map((o) => ({
                ...o,
                building:
                  this.buildings.find((b) => b.id === o.buildingId) ?? null,
                unit: this.units.find((un) => un.id === o.unitId) ?? null,
              }))
          : undefined,
        userRoles: include.userRoles
          ? this.userRoles
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({
                ...ur,
                role: this.roles.find((r) => r.id === ur.roleId) ?? undefined,
              }))
          : undefined,
      }));
    },
  };

  userRole = {
    createMany: async ({ data }: { data: UserRoleRecord[] }) => {
      this.userRoles.push(...data);
      return { count: data.length };
    },
  };

  residentProfile = {
    findFirst: async ({
      where,
      include,
    }: {
      where: { orgId: string; userId: string };
      include?: { user?: { select?: Record<string, boolean> } };
    }) => {
      const profile =
        this.profiles.find(
          (p) => p.userId === where.userId && p.orgId === where.orgId,
        ) ?? null;
      if (!profile) return null;
      if (include?.user) {
        const user = this.users.find((u) => u.id === where.userId) ?? null;
        return { ...profile, user };
      }
      return profile;
    },
    upsert: async ({ create }: { create: ResidentProfileRecord }) => {
      const profile: ResidentProfileRecord = {
        ...create,
        id: randomUUID(),
      };
      this.profiles.push(profile);
      return profile;
    },
  };

  residentInvite = {
    findFirst: async ({ where, orderBy, select }: any) => {
      let rows = [...this.residentInvites];
      if (where?.orgId) {
        rows = rows.filter((invite) => invite.orgId === where.orgId);
      }
      if (where?.userId) {
        rows = rows.filter((invite) => invite.userId === where.userId);
      }

      if (Array.isArray(orderBy)) {
        rows.sort((a, b) => {
          for (const rule of orderBy) {
            if (rule.sentAt) {
              const diff = a.sentAt.getTime() - b.sentAt.getTime();
              if (diff !== 0) return rule.sentAt === 'desc' ? -diff : diff;
            }
            if (rule.id) {
              const diff = a.id.localeCompare(b.id);
              if (diff !== 0) return rule.id === 'desc' ? -diff : diff;
            }
          }
          return 0;
        });
      }

      const row = rows[0] ?? null;
      if (!row || !select) return row;
      return Object.fromEntries(
        Object.entries(select)
          .filter(([, include]) => include)
          .map(([key]) => [key, (row as any)[key]]),
      );
    },
    findMany: async ({ where, include, orderBy, take }: any) => {
      let rows = this.residentInvites.filter(
        (invite) => invite.orgId === where.orgId,
      );

      const andConditions = Array.isArray(where.AND) ? where.AND : [];
      for (const condition of andConditions) {
        if (
          condition.OR?.some(
            (clause: any) =>
              clause.user?.name?.contains || clause.user?.email?.contains,
          )
        ) {
          rows = rows.filter((invite) => {
            const user = this.users.find((u) => u.id === invite.userId);
            return condition.OR.some((clause: any) => {
              if (clause.user?.name?.contains) {
                return (user?.name ?? '')
                  .toLowerCase()
                  .includes(clause.user.name.contains.toLowerCase());
              }
              if (clause.user?.email?.contains) {
                return (user?.email ?? '')
                  .toLowerCase()
                  .includes(clause.user.email.contains.toLowerCase());
              }
              return false;
            });
          });
          continue;
        }

        if (condition.status) {
          rows = rows.filter((invite) => invite.status === condition.status);
        }

        if (condition.expiresAt?.gt) {
          rows = rows.filter(
            (invite) =>
              invite.expiresAt.getTime() >
              new Date(condition.expiresAt.gt).getTime(),
          );
        }

        if (condition.expiresAt?.lte) {
          rows = rows.filter(
            (invite) =>
              invite.expiresAt.getTime() <=
              new Date(condition.expiresAt.lte).getTime(),
          );
        }

        const cursorOr = Array.isArray(condition.OR) ? condition.OR : null;
        if (cursorOr) {
          rows = rows.filter((invite) => {
            return cursorOr.some((cursorClause: any) => {
              if (cursorClause.sentAt?.lt) {
                return (
                  invite.sentAt.getTime() <
                  new Date(cursorClause.sentAt.lt).getTime()
                );
              }
              if (Array.isArray(cursorClause.AND)) {
                const [sentAtEq, idLt] = cursorClause.AND;
                return (
                  sentAtEq?.sentAt &&
                  idLt?.id?.lt &&
                  invite.sentAt.getTime() ===
                    new Date(sentAtEq.sentAt).getTime() &&
                  invite.id < idLt.id.lt
                );
              }
              return false;
            });
          });
        }
      }

      if (Array.isArray(orderBy)) {
        rows.sort((a, b) => {
          const sentAtDiff = b.sentAt.getTime() - a.sentAt.getTime();
          if (sentAtDiff !== 0) return sentAtDiff;
          return b.id.localeCompare(a.id);
        });
      }

      if (typeof take === 'number') {
        rows = rows.slice(0, take);
      }

      if (!include) {
        return rows;
      }

      return rows.map((invite) => {
        const user = this.users.find((u) => u.id === invite.userId) ?? null;
        const createdByUser = invite.createdByUserId
          ? (this.users.find((u) => u.id === invite.createdByUserId) ?? null)
          : null;
        return {
          ...invite,
          user: include.user
            ? {
                id: user?.id,
                email: user?.email,
                name: user?.name ?? null,
                isActive: user?.isActive ?? true,
                mustChangePassword: user?.mustChangePassword ?? true,
              }
            : undefined,
          createdByUser: include.createdByUser
            ? createdByUser
              ? {
                  id: createdByUser.id,
                  email: createdByUser.email,
                  name: createdByUser.name ?? null,
                }
              : null
            : undefined,
        };
      });
    },
  };
}

@Injectable()
class TestAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    if (!userId || typeof userId !== 'string') return false;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;
    request.user = { sub: user.id, email: user.email, orgId: user.orgId };
    return true;
  }
}

describe('Org residents list (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let org: OrgRecord;
  let admin: UserRecord;
  let requestPasswordResetMock: jest.Mock;

  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();
    requestPasswordResetMock = jest.fn().mockResolvedValue({ success: true });

    const moduleRef = await Test.createTestingModule({
      controllers: [OrgResidentsController],
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
            requestPasswordReset: requestPasswordResetMock,
          },
        },
        {
          provide: OrgUserLifecycleService,
          useValue: {
            buildUserResponse: async (user: UserRecord) => user,
            provisionOrgUser: jest.fn(),
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
    if (app) await app.close();
  });

  beforeEach(async () => {
    prisma.orgs = [];
    prisma.roles = [];
    prisma.users = [];
    prisma.userRoles = [];
    prisma.profiles = [];
    prisma.occupancies = [];
    prisma.residentInvites = [];
    prisma.buildings = [];
    prisma.units = [];
    permissionsByUser.clear();
    requestPasswordResetMock.mockClear();

    org = await prisma.org.create({ data: { name: 'Org A' } });
    admin = await prisma.user.create({
      data: { email: 'admin@org.test', orgId: org.id, name: 'Admin' },
    });
    const residentRole = await prisma.role.create({
      data: { key: 'resident', orgId: org.id },
    });

    // Building + unit for occupancy context
    const building: BuildingRecord = { id: randomUUID(), name: 'Tower A' };
    const unit: UnitRecord = { id: randomUUID(), label: '101' };
    prisma.buildings.push(building);
    prisma.units.push(unit);

    // Alice: has ACTIVE occupancy
    const alice = await prisma.user.create({
      data: { email: 'alice@org.test', orgId: org.id, name: 'Alice' },
    });
    // Bob: no occupancy at all (NEW)
    const bob = await prisma.user.create({
      data: { email: 'bob@org.test', orgId: org.id, name: 'Bob' },
    });
    // Carol: had occupancy but ended (FORMER)
    const carol = await prisma.user.create({
      data: { email: 'carol@org.test', orgId: org.id, name: 'Carol' },
    });

    await prisma.userRole.createMany({
      data: [
        { userId: alice.id, roleId: residentRole.id },
        { userId: bob.id, roleId: residentRole.id },
        { userId: carol.id, roleId: residentRole.id },
      ],
    });

    prisma.profiles.push({
      id: randomUUID(),
      orgId: org.id,
      userId: alice.id,
      nationality: 'UAE',
    });
    prisma.profiles.push({
      id: randomUUID(),
      orgId: org.id,
      userId: bob.id,
      nationality: 'UAE',
    });

    prisma.occupancies.push({
      id: randomUUID(),
      residentUserId: alice.id,
      status: 'ACTIVE',
      buildingId: building.id,
      unitId: unit.id,
      endAt: null,
    });

    prisma.occupancies.push({
      id: randomUUID(),
      residentUserId: carol.id,
      status: 'ENDED',
      buildingId: building.id,
      unitId: unit.id,
      endAt: new Date('2026-01-15'),
    });
  });

  it('lists residents and includes profile with user when requested', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const response = await fetch(
      `${baseUrl}/org/residents?includeProfile=true&status=ALL`,
      { headers: { 'x-user-id': admin.id } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(3);
    const alice = body.items.find((item: any) =>
      item.user.email.includes('alice'),
    );
    expect(alice).toBeTruthy();
    expect(alice.residentProfile.user.email).toBe('alice@org.test');
    expect(alice.hasActiveOccupancy).toBe(true);
  });

  it('returns residentStatus for each item', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const response = await fetch(`${baseUrl}/org/residents?status=ALL`, {
      headers: { 'x-user-id': admin.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const alice = body.items.find(
      (i: any) => i.user.email === 'alice@org.test',
    );
    const bob = body.items.find((i: any) => i.user.email === 'bob@org.test');
    const carol = body.items.find(
      (i: any) => i.user.email === 'carol@org.test',
    );

    expect(alice.residentStatus).toBe('ACTIVE');
    expect(bob.residentStatus).toBe('NEW');
    expect(carol.residentStatus).toBe('FORMER');
  });

  it('filters NEW residents (never had occupancy)', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const response = await fetch(`${baseUrl}/org/residents?status=NEW`, {
      headers: { 'x-user-id': admin.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].user.email).toBe('bob@org.test');
    expect(body.items[0].residentStatus).toBe('NEW');
    expect(body.items[0].lastOccupancy).toBeNull();
  });

  it('filters FORMER residents (had occupancy, all ended)', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const response = await fetch(`${baseUrl}/org/residents?status=FORMER`, {
      headers: { 'x-user-id': admin.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].user.email).toBe('carol@org.test');
    expect(body.items[0].residentStatus).toBe('FORMER');
    expect(body.items[0].lastOccupancy).toBeTruthy();
    expect(body.items[0].lastOccupancy.buildingName).toBe('Tower A');
    expect(body.items[0].lastOccupancy.unitLabel).toBe('101');
  });

  it('WITHOUT_OCCUPANCY returns both NEW and FORMER (backward compat)', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const response = await fetch(
      `${baseUrl}/org/residents?status=WITHOUT_OCCUPANCY`,
      { headers: { 'x-user-id': admin.id } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(2);
    const emails = body.items.map((i: any) => i.user.email).sort();
    expect(emails).toEqual(['bob@org.test', 'carol@org.test']);
  });

  it('WITH_OCCUPANCY returns only active residents', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const response = await fetch(
      `${baseUrl}/org/residents?status=WITH_OCCUPANCY`,
      { headers: { 'x-user-id': admin.id } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].user.email).toBe('alice@org.test');
    expect(body.items[0].residentStatus).toBe('ACTIVE');
  });

  it('lists resident invites and enforces org isolation', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const now = new Date();
    const [alice, bob] = prisma.users.filter((u) =>
      ['alice@org.test', 'bob@org.test'].includes(u.email),
    );
    const otherOrg = await prisma.org.create({ data: { name: 'Other Org' } });
    const outsider = await prisma.user.create({
      data: { email: 'outside@org.test', orgId: otherOrg.id, name: 'Outside' },
    });

    prisma.residentInvites.push(
      {
        id: randomUUID(),
        orgId: org.id,
        userId: alice.id,
        createdByUserId: admin.id,
        email: alice.email,
        status: 'SENT',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        sentAt: new Date(now.getTime() - 5 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId: org.id,
        userId: bob.id,
        createdByUserId: admin.id,
        email: bob.email,
        status: 'FAILED',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        sentAt: new Date(now.getTime() - 10 * 60 * 1000),
        failedAt: new Date(now.getTime() - 9 * 60 * 1000),
        failureReason: 'smtp timeout',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId: otherOrg.id,
        userId: outsider.id,
        createdByUserId: null,
        email: outsider.email,
        status: 'SENT',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      },
    );

    const response = await fetch(
      `${baseUrl}/org/residents/invites?status=ALL`,
      {
        headers: { 'x-user-id': admin.id },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBe(2);
    const emails = body.items.map((item: any) => item.user.email).sort();
    expect(emails).toEqual(['alice@org.test', 'bob@org.test']);
  });

  it('filters resident invites by status semantics', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));

    const now = new Date();
    const [alice, bob, carol] = prisma.users.filter((u) =>
      ['alice@org.test', 'bob@org.test', 'carol@org.test'].includes(u.email),
    );

    prisma.residentInvites.push(
      {
        id: randomUUID(),
        orgId: org.id,
        userId: alice.id,
        createdByUserId: admin.id,
        email: alice.email,
        status: 'SENT',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        sentAt: new Date(now.getTime() - 5 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId: org.id,
        userId: bob.id,
        createdByUserId: admin.id,
        email: bob.email,
        status: 'SENT',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        sentAt: new Date(now.getTime() - 15 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId: org.id,
        userId: carol.id,
        createdByUserId: admin.id,
        email: carol.email,
        status: 'ACCEPTED',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        sentAt: new Date(now.getTime() - 25 * 60 * 1000),
        acceptedAt: new Date(now.getTime() - 20 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      },
    );

    const pending = await fetch(
      `${baseUrl}/org/residents/invites?status=PENDING`,
      { headers: { 'x-user-id': admin.id } },
    ).then((r) => r.json());
    expect(pending.items.length).toBe(1);
    expect(pending.items[0].status).toBe('PENDING');

    const expired = await fetch(
      `${baseUrl}/org/residents/invites?status=EXPIRED`,
      { headers: { 'x-user-id': admin.id } },
    ).then((r) => r.json());
    expect(expired.items.length).toBe(1);
    expect(expired.items[0].status).toBe('EXPIRED');

    const accepted = await fetch(
      `${baseUrl}/org/residents/invites?status=ACCEPTED`,
      { headers: { 'x-user-id': admin.id } },
    ).then((r) => r.json());
    expect(accepted.items.length).toBe(1);
    expect(accepted.items[0].status).toBe('ACCEPTED');
  });

  it('paginates invite list with deterministic sentAt/id cursor', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.read']));
    const bob = prisma.users.find((u) => u.email === 'bob@org.test')!;

    const sentAt = new Date('2026-03-01T00:00:00.000Z');
    prisma.residentInvites.push(
      {
        id: 'inv-1',
        orgId: org.id,
        userId: bob.id,
        createdByUserId: admin.id,
        email: bob.email,
        status: 'SENT',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
        sentAt,
        createdAt: sentAt,
        updatedAt: sentAt,
      },
      {
        id: 'inv-2',
        orgId: org.id,
        userId: bob.id,
        createdByUserId: admin.id,
        email: bob.email,
        status: 'SENT',
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
        sentAt,
        createdAt: sentAt,
        updatedAt: sentAt,
      },
    );

    const page1Resp = await fetch(`${baseUrl}/org/residents/invites?limit=1`, {
      headers: { 'x-user-id': admin.id },
    });
    expect(page1Resp.status).toBe(200);
    const page1 = await page1Resp.json();
    expect(page1.items.length).toBe(1);
    expect(page1.items[0].inviteId).toBe('inv-2');
    expect(page1.nextCursor).toBeTruthy();

    const page2Resp = await fetch(
      `${baseUrl}/org/residents/invites?limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`,
      {
        headers: { 'x-user-id': admin.id },
      },
    );
    expect(page2Resp.status).toBe(200);
    const page2 = await page2Resp.json();
    expect(page2.items.length).toBe(1);
    expect(page2.items[0].inviteId).toBe('inv-1');
  });

  it('rejects invite list access without residents.read permission', async () => {
    permissionsByUser.set(admin.id, new Set());

    const response = await fetch(`${baseUrl}/org/residents/invites`, {
      headers: { 'x-user-id': admin.id },
    });

    expect(response.status).toBe(403);
  });

  it('sends invite via RESIDENT_INVITE purpose from resend endpoint', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.write']));
    const bob = prisma.users.find((u) => u.email === 'bob@org.test')!;

    const response = await fetch(
      `${baseUrl}/org/residents/${bob.id}/send-invite`,
      {
        method: 'POST',
        headers: { 'x-user-id': admin.id },
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(requestPasswordResetMock).toHaveBeenCalledWith(bob.email, {
      purpose: 'RESIDENT_INVITE',
      issuedByUserId: admin.id,
    });
  });

  it('blocks rapid resend when a recent invite already exists', async () => {
    permissionsByUser.set(admin.id, new Set(['residents.write']));
    const bob = prisma.users.find((u) => u.email === 'bob@org.test')!;
    const now = new Date();

    prisma.residentInvites.push({
      id: randomUUID(),
      orgId: org.id,
      userId: bob.id,
      createdByUserId: admin.id,
      email: bob.email,
      status: 'SENT',
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const response = await fetch(
      `${baseUrl}/org/residents/${bob.id}/send-invite`,
      {
        method: 'POST',
        headers: { 'x-user-id': admin.id },
      },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.message).toContain('Invite already sent recently');
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });
});

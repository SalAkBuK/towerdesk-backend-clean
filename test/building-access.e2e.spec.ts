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
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { BuildingsController } from '../src/modules/buildings/buildings.controller';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { BuildingsService } from '../src/modules/buildings/buildings.service';
import { UnitsController } from '../src/modules/units/units.controller';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { UnitsService } from '../src/modules/units/units.service';
import { UnitOwnershipService } from '../src/modules/unit-ownerships/unit-ownership.service';
import { UsersRepo } from '../src/modules/users/users.repo';
import { OccupanciesController } from '../src/modules/occupancies/occupancies.controller';
import { OccupanciesRepo } from '../src/modules/occupancies/occupancies.repo';
import { OccupanciesService } from '../src/modules/occupancies/occupancies.service';

type OrgRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  refreshTokenHash?: string | null;
  name?: string | null;
  orgId?: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
  city: string;
  emirate?: string | null;
  country: string;
  timezone: string;
  floors?: number | null;
  unitsCount?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
  floor?: number | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BuildingAmenityRecord = {
  id: string;
  buildingId: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type UnitAmenityRecord = {
  unitId: string;
  amenityId: string;
  createdAt: Date;
};

type AccessAssignmentRecord = {
  id: string;
  userId: string;
  scopeType: 'BUILDING';
  scopeId: string;
  createdAt: Date;
  updatedAt: Date;
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
  updatedAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private units: UnitRecord[] = [];
  private buildingAmenities: BuildingAmenityRecord[] = [];
  private unitAmenities: UnitAmenityRecord[] = [];
  private accessAssignments: AccessAssignmentRecord[] = [];
  private occupancies: OccupancyRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const now = new Date();
      const org: OrgRecord = {
        id: randomUUID(),
        name: data.name,
        createdAt: now,
        updatedAt: now,
      };
      this.orgs.push(org);
      return org;
    },
  };

  user = {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; email?: string };
    }) => {
      if (where.id) {
        return this.users.find((user) => user.id === where.id) ?? null;
      }
      if (where.email) {
        return this.users.find((user) => user.email === where.email) ?? null;
      }
      return null;
    },
    create: async ({
      data,
    }: {
      data: {
        email: string;
        passwordHash: string;
        name?: string | null;
        orgId?: string | null;
        mustChangePassword?: boolean;
        isActive?: boolean;
      };
    }) => {
      const now = new Date();
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name ?? null,
        orgId: data.orgId ?? null,
        mustChangePassword: data.mustChangePassword ?? false,
        isActive: data.isActive ?? true,
        refreshTokenHash: null,
        createdAt: now,
        updatedAt: now,
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
        emirate?: string | null;
        country: string;
        timezone: string;
        floors?: number | null;
        unitsCount?: number | null;
      };
    }) => {
      const now = new Date();
      const building: BuildingRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        name: data.name,
        city: data.city,
        emirate: data.emirate ?? null,
        country: data.country,
        timezone: data.timezone,
        floors: data.floors ?? null,
        unitsCount: data.unitsCount ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.buildings.push(building);
      return building;
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where: {
        orgId?: string;
        accessAssignments?: {
          some: { userId: string; scopeType: 'BUILDING' };
        };
      };
      orderBy?: { createdAt?: 'asc' | 'desc' };
    }) => {
      let results = this.buildings.slice();
      if (where.orgId) {
        results = results.filter((building) => building.orgId === where.orgId);
      }

      const assignedUserId = where.accessAssignments?.some.userId;
      if (assignedUserId) {
        const buildingIds = new Set(
          this.accessAssignments
            .filter(
              (assignment) =>
                assignment.userId === assignedUserId &&
                assignment.scopeType === 'BUILDING',
            )
            .map((assignment) => assignment.scopeId),
        );
        results = results.filter((building) => buildingIds.has(building.id));
      }

      if (orderBy?.createdAt) {
        results.sort((a, b) =>
          orderBy.createdAt === 'desc'
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }

      return results;
    },
    findFirst: async ({ where }: { where: { id: string; orgId: string } }) => {
      return (
        this.buildings.find(
          (building) =>
            building.id === where.id && building.orgId === where.orgId,
        ) ?? null
      );
    },
  };

  unit = {
    create: async ({
      data,
    }: {
      data: {
        buildingId: string;
        label: string;
        floor?: number;
        notes?: string;
      };
    }) => {
      const now = new Date();
      const unit: UnitRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        label: data.label,
        floor: data.floor ?? null,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.units.push(unit);
      return unit;
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where: {
        buildingId: string;
        occupancies?: { none: { status: 'ACTIVE' } };
      };
      orderBy?: { createdAt?: 'asc' | 'desc' };
    }) => {
      let results = this.units.filter(
        (unit) => unit.buildingId === where.buildingId,
      );

      if (where.occupancies?.none?.status === 'ACTIVE') {
        const occupiedUnitIds = new Set(
          this.occupancies
            .filter((occupancy) => occupancy.status === 'ACTIVE')
            .map((occupancy) => occupancy.unitId),
        );
        results = results.filter((unit) => !occupiedUnitIds.has(unit.id));
      }

      if (orderBy?.createdAt) {
        results.sort((a, b) =>
          orderBy.createdAt === 'desc'
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }

      return results;
    },
    count: async ({
      where,
    }: {
      where: {
        buildingId: string;
        occupancies?: { none: { status: 'ACTIVE' } };
      };
    }) => {
      const results = await this.unit.findMany({ where });
      return results.length;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; buildingId: string };
    }) => {
      return (
        this.units.find(
          (unit) =>
            unit.buildingId === where.buildingId &&
            (where.id ? unit.id === where.id : true),
        ) ?? null
      );
    },
  };

  buildingAmenity = {
    findMany: async ({
      where,
      select,
    }: {
      where: {
        buildingId: string;
        isActive?: boolean;
        isDefault?: boolean;
        id?: { in: string[] };
      };
      select?: { id?: boolean };
    }) => {
      const amenities = this.buildingAmenities.filter((amenity) => {
        if (amenity.buildingId !== where.buildingId) {
          return false;
        }
        if (
          where.isActive !== undefined &&
          amenity.isActive !== where.isActive
        ) {
          return false;
        }
        if (
          where.isDefault !== undefined &&
          amenity.isDefault !== where.isDefault
        ) {
          return false;
        }
        if (where.id?.in && !where.id.in.includes(amenity.id)) {
          return false;
        }
        return true;
      });

      if (select?.id) {
        return amenities.map((amenity) => ({ id: amenity.id }));
      }

      return amenities;
    },
  };

  unitAmenity = {
    createMany: async ({
      data,
    }: {
      data: { unitId: string; amenityId: string }[];
      skipDuplicates?: boolean;
    }) => {
      for (const entry of data) {
        const exists = this.unitAmenities.some(
          (link) =>
            link.unitId === entry.unitId && link.amenityId === entry.amenityId,
        );
        if (exists) {
          continue;
        }
        this.unitAmenities.push({
          unitId: entry.unitId,
          amenityId: entry.amenityId,
          createdAt: new Date(),
        });
      }

      return { count: data.length };
    },
    deleteMany: async ({ where }: { where: { unitId: string } }) => {
      const before = this.unitAmenities.length;
      this.unitAmenities = this.unitAmenities.filter(
        (link) => link.unitId !== where.unitId,
      );
      return { count: before - this.unitAmenities.length };
    },
  };

  occupancy = {
    findFirst: async ({
      where,
    }: {
      where: {
        unitId?: string;
        buildingId?: string;
        residentUserId?: string;
        status: 'ACTIVE';
      };
    }) => {
      return (
        this.occupancies.find(
          (occupancy) =>
            (where.unitId ? occupancy.unitId === where.unitId : true) &&
            (where.buildingId
              ? occupancy.buildingId === where.buildingId
              : true) &&
            (where.residentUserId
              ? occupancy.residentUserId === where.residentUserId
              : true) &&
            occupancy.status === where.status,
        ) ?? null
      );
    },
    findMany: async ({
      where,
      include,
      orderBy,
      take,
    }: {
      where: {
        buildingId: string;
        status?: 'ACTIVE';
      };
      include?: { unit?: boolean; residentUser?: boolean };
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
      take?: number;
    }) => {
      const results = this.occupancies.filter(
        (occupancy) =>
          occupancy.buildingId === where.buildingId &&
          (where.status ? occupancy.status === where.status : true),
      );

      const primaryOrder = orderBy?.[0];
      if (primaryOrder?.createdAt) {
        results.sort((a, b) =>
          primaryOrder.createdAt === 'desc'
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }

      const mapped = results.map((occupancy) => ({
        ...occupancy,
        unit: include?.unit
          ? this.units.find((unit) => unit.id === occupancy.unitId)
          : undefined,
        residentUser: include?.residentUser
          ? this.users.find((user) => user.id === occupancy.residentUserId)
          : undefined,
      }));

      return take ? mapped.slice(0, take) : mapped;
    },
    create: async ({
      data,
      include,
    }: {
      data: {
        buildingId: string;
        unitId: string;
        residentUserId: string;
        status: 'ACTIVE';
        endAt: null;
      };
      include?: { unit?: boolean; residentUser?: boolean };
    }) => {
      const now = new Date();
      const occupancy: OccupancyRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        unitId: data.unitId,
        residentUserId: data.residentUserId,
        status: data.status,
        startAt: now,
        endAt: data.endAt,
        createdAt: now,
        updatedAt: now,
      };
      this.occupancies.push(occupancy);
      return {
        ...occupancy,
        unit: include?.unit
          ? this.units.find((unit) => unit.id === occupancy.unitId)
          : undefined,
        residentUser: include?.residentUser
          ? this.users.find((user) => user.id === occupancy.residentUserId)
          : undefined,
      };
    },
    count: async ({
      where,
    }: {
      where: { buildingId: string; status: 'ACTIVE' };
    }) => {
      return this.occupancies.filter(
        (occupancy) =>
          occupancy.buildingId === where.buildingId &&
          occupancy.status === where.status,
      ).length;
    },
  };

  userAccessAssignment = {
    create: async ({
      data,
    }: {
      data: {
        userId: string;
        scopeType: 'BUILDING';
        scopeId: string;
      };
    }) => {
      const now = new Date();
      const assignment: AccessAssignmentRecord = {
        id: randomUUID(),
        userId: data.userId,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        createdAt: now,
        updatedAt: now,
      };
      this.accessAssignments.push(assignment);
      return assignment;
    },
  };

  unitType = {
    findMany: async () => [],
  };

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]) {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg(this);
  }

  reset() {
    this.orgs = [];
    this.users = [];
    this.buildings = [];
    this.units = [];
    this.buildingAmenities = [];
    this.unitAmenities = [];
    this.accessAssignments = [];
    this.occupancies = [];
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
      sub: user.id,
      email: user.email,
      orgId: user.orgId ?? null,
    };
    return true;
  }
}

describe('Building-scoped access (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgScopedUser: UserRecord;
  let buildingScopedUser: UserRecord;
  let residentUser: UserRecord;
  let plainUser: UserRecord;
  let crossOrgUser: UserRecord;
  let buildingA: BuildingRecord;
  let buildingASecond: BuildingRecord;
  let unit1: UnitRecord;

  const permissionsByUser = new Map<string, Set<string>>();
  const permissionsByUserAndBuilding = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [
        BuildingsController,
        UnitsController,
        OccupanciesController,
      ],
      providers: [
        BuildingsService,
        BuildingsRepo,
        UnitsService,
        {
          provide: UnitOwnershipService,
          useValue: {
            syncCurrentOwner: async () => undefined,
          },
        },
        UnitsRepo,
        OccupanciesService,
        OccupanciesRepo,
        UsersRepo,
        OrgScopeGuard,
        BuildingAccessService,
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
            getUserEffectivePermissions: async (
              userId: string,
              scope?: { buildingId?: string },
            ) => {
              const effective = new Set(permissionsByUser.get(userId) ?? []);

              if (scope?.buildingId) {
                for (const permission of permissionsByUserAndBuilding.get(
                  `${userId}:${scope.buildingId}`,
                ) ?? []) {
                  effective.add(permission);
                }
              }

              return effective;
            },
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
    permissionsByUserAndBuilding.clear();

    const orgA = await prisma.org.create({ data: { name: 'Org A' } });
    const orgB = await prisma.org.create({ data: { name: 'Org B' } });

    buildingA = await prisma.building.create({
      data: {
        orgId: orgA.id,
        name: 'A1',
        city: 'Dubai',
        emirate: 'Dubai',
        country: 'ARE',
        timezone: 'Asia/Dubai',
      },
    });
    buildingASecond = await prisma.building.create({
      data: {
        orgId: orgA.id,
        name: 'A2',
        city: 'Dubai',
        emirate: 'Dubai',
        country: 'ARE',
        timezone: 'Asia/Dubai',
      },
    });
    unit1 = await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-101' },
    });

    orgScopedUser = await prisma.user.create({
      data: {
        email: 'org-scoped@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Org Scoped',
        isActive: true,
      },
    });
    buildingScopedUser = await prisma.user.create({
      data: {
        email: 'building-scoped@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Building Scoped',
        isActive: true,
      },
    });
    residentUser = await prisma.user.create({
      data: {
        email: 'resident@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Resident',
        isActive: true,
      },
    });
    plainUser = await prisma.user.create({
      data: {
        email: 'plain@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Plain',
        isActive: true,
      },
    });
    crossOrgUser = await prisma.user.create({
      data: {
        email: 'cross-org@org.test',
        passwordHash: 'hash',
        orgId: orgB.id,
        name: 'Cross Org',
        isActive: true,
      },
    });

    permissionsByUser.set(
      orgScopedUser.id,
      new Set([
        'buildings.read',
        'buildings.write',
        'units.read',
        'units.write',
        'occupancy.read',
        'occupancy.write',
      ]),
    );

    permissionsByUserAndBuilding.set(
      `${buildingScopedUser.id}:${buildingA.id}`,
      new Set(['buildings.read', 'units.read', 'units.write']),
    );

    await prisma.userAccessAssignment.create({
      data: {
        userId: buildingScopedUser.id,
        scopeType: 'BUILDING',
        scopeId: buildingA.id,
      },
    });
  });

  it('returns 404 for cross-org access before permission checks', async () => {
    const response = await fetch(`${baseUrl}/org/buildings/${buildingA.id}`, {
      headers: { 'x-user-id': crossOrgUser.id },
    });

    expect(response.status).toBe(404);
  });

  it('org-scoped permissions allow read and write building resources', async () => {
    const detail = await fetch(`${baseUrl}/org/buildings/${buildingA.id}`, {
      headers: { 'x-user-id': orgScopedUser.id },
    });
    expect(detail.status).toBe(200);

    const createUnit = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgScopedUser.id,
        },
        body: JSON.stringify({ label: 'A-103' }),
      },
    );
    expect(createUnit.status).toBe(201);
  });

  it('building-scoped permissions are limited to the assigned building', async () => {
    const allowed = await fetch(`${baseUrl}/org/buildings/${buildingA.id}`, {
      headers: { 'x-user-id': buildingScopedUser.id },
    });
    expect(allowed.status).toBe(200);

    const denied = await fetch(
      `${baseUrl}/org/buildings/${buildingASecond.id}`,
      {
        headers: { 'x-user-id': buildingScopedUser.id },
      },
    );
    expect(denied.status).toBe(403);

    const createUnit = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': buildingScopedUser.id,
        },
        body: JSON.stringify({ label: 'A-104' }),
      },
    );
    expect(createUnit.status).toBe(201);
  });

  it('resident occupancy only opens resident-safe read endpoints', async () => {
    permissionsByUserAndBuilding.set(
      `${orgScopedUser.id}:${buildingA.id}`,
      new Set(['occupancy.write']),
    );

    const occupancyResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/occupancies`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgScopedUser.id,
        },
        body: JSON.stringify({
          unitId: unit1.id,
          residentUserId: residentUser.id,
        }),
      },
    );
    expect(occupancyResponse.status).toBe(201);

    const basicUnits = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/units/basic`,
      {
        headers: { 'x-user-id': residentUser.id },
      },
    );
    expect(basicUnits.status).toBe(200);

    const fullUnits = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/units`,
      {
        headers: { 'x-user-id': residentUser.id },
      },
    );
    expect(fullUnits.status).toBe(403);
  });

  it('lists buildings assigned through building-scope access assignments', async () => {
    const response = await fetch(`${baseUrl}/org/buildings/assigned`, {
      headers: { 'x-user-id': buildingScopedUser.id },
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(buildingA.id);
  });

  it('same-org users without scoped permissions are forbidden', async () => {
    const response = await fetch(`${baseUrl}/org/buildings/${buildingA.id}`, {
      headers: { 'x-user-id': plainUser.id },
    });

    expect(response.status).toBe(403);
  });
});

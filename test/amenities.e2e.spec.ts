import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { PlatformAuthGuard } from '../src/common/guards/platform-auth.guard';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { BuildingsController } from '../src/modules/buildings/buildings.controller';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { BuildingsService } from '../src/modules/buildings/buildings.service';
import { PlatformOrgsController } from '../src/modules/platform/platform-orgs.controller';
import { PlatformOrgsService } from '../src/modules/platform/platform-orgs.service';
import { UnitsController } from '../src/modules/units/units.controller';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { UnitsService } from '../src/modules/units/units.service';
import { UnitOwnershipService } from '../src/modules/unit-ownerships/unit-ownership.service';
import { BuildingAmenitiesController } from '../src/modules/building-amenities/building-amenities.controller';
import { BuildingAmenitiesRepo } from '../src/modules/building-amenities/building-amenities.repo';
import { BuildingAmenitiesService } from '../src/modules/building-amenities/building-amenities.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type OrgRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type RoleRecord = {
  id: string;
  orgId?: string | null;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PermissionRecord = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};

type RolePermissionRecord = {
  roleId: string;
  permissionId: string;
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

type UserRoleRecord = {
  userId: string;
  roleId: string;
  createdAt: Date;
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

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
  floor?: number | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private roles: RoleRecord[] = [];
  private permissions: PermissionRecord[] = [];
  private rolePermissions: RolePermissionRecord[] = [];
  private users: UserRecord[] = [];
  private userRoles: UserRoleRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private units: UnitRecord[] = [];
  private buildingAmenities: BuildingAmenityRecord[] = [];
  private unitAmenities: UnitAmenityRecord[] = [];

  org = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.orgs.find((org) => org.id === where.id) ?? null;
    },
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

  role = {
    findUnique: async ({ where }: { where: { key: string } }) => {
      return this.roles.find((role) => role.key === where.key) ?? null;
    },
    findFirst: async ({
      where,
    }: {
      where: { key: string; orgId?: string | null };
    }) => {
      return (
        this.roles.find(
          (role) =>
            role.key === where.key &&
            (where.orgId === undefined ? true : role.orgId === where.orgId),
        ) ?? null
      );
    },
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { orgId_key: { orgId: string; key: string } };
      update: Partial<RoleRecord>;
      create: {
        orgId: string;
        key: string;
        name: string;
        description?: string | null;
        isSystem?: boolean;
      };
    }) => {
      const existing = this.roles.find(
        (role) =>
          role.key === where.orgId_key.key &&
          role.orgId === where.orgId_key.orgId,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const now = new Date();
      const role: RoleRecord = {
        id: randomUUID(),
        orgId: create.orgId,
        key: create.key,
        name: create.name,
        description: create.description ?? null,
        isSystem: create.isSystem ?? false,
        createdAt: now,
        updatedAt: now,
      };
      this.roles.push(role);
      return role;
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

  userRole = {
    create: async ({
      data,
    }: {
      data: { userId: string; roleId: string };
    }) => {
      const record: UserRoleRecord = {
        userId: data.userId,
        roleId: data.roleId,
        createdAt: new Date(),
      };
      this.userRoles.push(record);
      return record;
    },
  };

  permission = {
    findMany: async ({
      where,
    }: {
      where?: { key?: { in: string[] } };
    }) => {
      if (!where?.key?.in) {
        return this.permissions.slice();
      }
      return this.permissions.filter((permission) =>
        where.key!.in.includes(permission.key),
      );
    },
  };

  rolePermission = {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: { roleId: string; permissionId: string }[];
      skipDuplicates?: boolean;
    }) => {
      let created = 0;
      for (const entry of data) {
        const exists = this.rolePermissions.some(
          (record) =>
            record.roleId === entry.roleId &&
            record.permissionId === entry.permissionId,
        );
        if (exists && skipDuplicates) {
          continue;
        }
        this.rolePermissions.push({
          roleId: entry.roleId,
          permissionId: entry.permissionId,
        });
        created += 1;
      }
      return { count: created };
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
    findFirst: async ({
      where,
    }: {
      where: { id: string; orgId: string };
    }) => {
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
    findFirst: async ({
      where,
      include,
    }: {
      where: { id?: string; buildingId: string };
      include?: { amenities?: { include?: { amenity?: boolean } } };
    }) => {
      const unit =
        this.units.find(
          (entry) =>
            entry.buildingId === where.buildingId &&
            (where.id ? entry.id === where.id : true),
        ) ?? null;
      if (!unit) {
        return null;
      }
      if (!include?.amenities) {
        return unit;
      }
      const links = this.unitAmenities.filter((link) => link.unitId === unit.id);
      const amenities = links.map((link) => ({
        ...link,
        amenity: this.buildingAmenities.find((amenity) => amenity.id === link.amenityId) ?? null,
      }));
      return {
        ...unit,
        amenities,
      };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.units.find((unit) => unit.id === where.id) ?? null;
    },
  };

  buildingAmenity = {
    findMany: async ({
      where,
      select,
    }: {
      where: { buildingId: string; isActive?: boolean; isDefault?: boolean; id?: { in: string[] } };
      select?: { id?: boolean };
    }) => {
      const items = this.buildingAmenities.filter((amenity) => {
        if (amenity.buildingId !== where.buildingId) return false;
        if (where.isActive !== undefined && amenity.isActive !== where.isActive) return false;
        if (where.isDefault !== undefined && amenity.isDefault !== where.isDefault) return false;
        if (where.id?.in && !where.id.in.includes(amenity.id)) return false;
        return true;
      });
      if (select?.id) {
        return items.map((amenity) => ({ id: amenity.id }));
      }
      return items;
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; buildingId: string };
    }) => {
      return (
        this.buildingAmenities.find(
          (amenity) =>
            amenity.id === where.id && amenity.buildingId === where.buildingId,
        ) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: { buildingId: string; name: string; isActive?: boolean; isDefault?: boolean };
    }) => {
      const exists = this.buildingAmenities.find(
        (amenity) =>
          amenity.buildingId === data.buildingId && amenity.name === data.name,
      );
      if (exists) {
        const error = new Error('Unique constraint failed');
        (error as { code?: string }).code = 'P2002';
        throw error;
      }
      const now = new Date();
      const amenity: BuildingAmenityRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        name: data.name,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
      };
      this.buildingAmenities.push(amenity);
      return amenity;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { name?: string; isActive?: boolean; isDefault?: boolean };
    }) => {
      const index = this.buildingAmenities.findIndex(
        (amenity) => amenity.id === where.id,
      );
      if (index === -1) {
        throw new Error('Amenity not found');
      }
      const updated: BuildingAmenityRecord = {
        ...this.buildingAmenities[index],
        ...data,
        updatedAt: new Date(),
      };
      this.buildingAmenities[index] = updated;
      return updated;
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
          (link) => link.unitId === entry.unitId && link.amenityId === entry.amenityId,
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

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]) {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg(this);
  }

  reset() {
    this.orgs = [];
    this.roles = [];
    this.users = [];
    this.userRoles = [];
    this.permissions = [];
    this.rolePermissions = [];
    this.buildings = [];
    this.units = [];
    this.buildingAmenities = [];
    this.unitAmenities = [];
  }

  seedOrgAdminRole() {
    const now = new Date();
    this.roles.push({
      id: randomUUID(),
      orgId: null,
      key: 'org_admin',
      name: 'Org Admin',
      description: 'Org administrator',
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
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

@Injectable()
class AllowPermissionsGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('Building amenities (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgAAdminId: string;
  let buildingId: string;

  const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [
        PlatformOrgsController,
        BuildingsController,
        UnitsController,
        BuildingAmenitiesController,
      ],
      providers: [
        PlatformOrgsService,
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
        BuildingAmenitiesService,
        BuildingAmenitiesRepo,
        OrgScopeGuard,
        PlatformAuthGuard,
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async () => new Set<string>(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(AllowPermissionsGuard)
      .overrideGuard(BuildingAccessGuard)
      .useClass(AllowPermissionsGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    prisma.reset();
    prisma.seedOrgAdminRole();

    const orgA = await prisma.org.create({ data: { name: 'Org A' } });
    const orgAAdmin = await prisma.user.create({
      data: {
        email: 'admin-a@org.test',
        passwordHash: 'hash',
        name: 'Org A Admin',
        orgId: orgA.id,
        isActive: true,
      },
    });
    const building = await prisma.building.create({
      data: {
        orgId: orgA.id,
        name: 'Alpha Tower',
        city: 'Dubai',
        country: 'ARE',
        timezone: 'Asia/Dubai',
      },
    });

    orgAAdminId = orgAAdmin.id;
    buildingId = building.id;
  });

  it('applies default amenities when amenityIds is omitted', async () => {
    const amenityResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/amenities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ name: 'Balcony', isDefault: true }),
      },
    );
    expect(amenityResponse.status).toBe(201);
    const amenityBody = await amenityResponse.json();

    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ label: 'C-301' }),
      },
    );
    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createBody.id}`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.amenityIds).toEqual([amenityBody.id]);
    expect(detailBody.amenities).toEqual([
      { id: amenityBody.id, name: amenityBody.name },
    ]);
  });

  it('does not apply defaults when amenityIds is empty', async () => {
    await fetch(`${baseUrl}/org/buildings/${buildingId}/amenities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Gym', isDefault: true }),
    });

    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ label: 'C-302', amenityIds: [] }),
      },
    );
    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createBody.id}`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.amenityIds).toEqual([]);
  });

  it('replaces amenityIds on patch and rejects cross-building amenities', async () => {
    const amenityResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/amenities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ name: 'Parking' }),
      },
    );
    const amenityBody = await amenityResponse.json();

    const otherAmenityResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/amenities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ name: 'Pool' }),
      },
    );
    const otherAmenityBody = await otherAmenityResponse.json();

    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ label: 'C-303', amenityIds: [amenityBody.id] }),
      },
    );
    const createBody = await createResponse.json();

    const patchResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createBody.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ amenityIds: [otherAmenityBody.id] }),
      },
    );
    expect(patchResponse.status).toBe(200);

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createBody.id}`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    const detailBody = await detailResponse.json();
    expect(detailBody.amenityIds).toEqual([otherAmenityBody.id]);

    const buildingResponse = await fetch(`${baseUrl}/org/buildings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Secondary Tower', city: 'Dubai' }),
    });
    const buildingBody = await buildingResponse.json();

    const crossAmenityResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingBody.id}/amenities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ name: 'Garden' }),
      },
    );
    const crossAmenityBody = await crossAmenityResponse.json();

    const crossPatch = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createBody.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ amenityIds: [crossAmenityBody.id] }),
      },
    );
    expect(crossPatch.status).toBe(400);
  });

  it('lists building amenities with isDefault flags', async () => {
    await fetch(`${baseUrl}/org/buildings/${buildingId}/amenities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Gym', isDefault: true }),
    });

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/amenities`,
      { headers: { 'x-user-id': orgAAdminId } },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody[0]).toEqual(
      expect.objectContaining({ name: 'Gym', isDefault: true }),
    );
  });
});

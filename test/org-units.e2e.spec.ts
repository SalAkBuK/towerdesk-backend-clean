import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
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
import { UnitTypesController } from '../src/modules/unit-types/unit-types.controller';
import { UnitTypesRepo } from '../src/modules/unit-types/unit-types.repo';
import { UnitTypesService } from '../src/modules/unit-types/unit-types.service';
import { OwnersController } from '../src/modules/owners/owners.controller';
import { OwnerProvisioningService } from '../src/modules/owners/owner-provisioning.service';
import { OwnersRepo } from '../src/modules/owners/owners.repo';
import { OwnersService } from '../src/modules/owners/owners.service';
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
  unitTypeId?: string | null;
  ownerId?: string | null;
  maintenancePayer?: string | null;
  unitSize?: number | null;
  unitSizeUnit?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  balcony?: boolean | null;
  kitchenType?: string | null;
  furnishedStatus?: string | null;
  rentAnnual?: number | null;
  paymentFrequency?: string | null;
  securityDepositAmount?: number | null;
  serviceChargePerUnit?: number | null;
  vatApplicable?: boolean | null;
  electricityMeterNumber?: string | null;
  waterMeterNumber?: string | null;
  gasMeterNumber?: string | null;
  floor?: number | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UnitTypeRecord = {
  id: string;
  orgId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OwnerRecord = {
  id: string;
  orgId: string;
  partyId: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
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
  private buildingAmenities: BuildingAmenityRecord[] = [];
  private unitAmenities: UnitAmenityRecord[] = [];
  private units: UnitRecord[] = [];
  private unitTypes: UnitTypeRecord[] = [];
  private owners: OwnerRecord[] = [];

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
    findMany: async ({ where }: { where: { orgId: string } }) => {
      return this.buildings.filter((building) => building.orgId === where.orgId);
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
        unitTypeId?: string;
        ownerId?: string;
        maintenancePayer?: string;
        unitSize?: number;
        unitSizeUnit?: string;
        bedrooms?: number;
        bathrooms?: number;
        balcony?: boolean;
        kitchenType?: string;
        furnishedStatus?: string;
        rentAnnual?: number;
        paymentFrequency?: string;
        securityDepositAmount?: number;
        serviceChargePerUnit?: number;
        vatApplicable?: boolean;
        electricityMeterNumber?: string;
        waterMeterNumber?: string;
        gasMeterNumber?: string;
        floor?: number;
        notes?: string;
      };
    }) => {
      const exists = this.units.find(
        (unit) =>
          unit.buildingId === data.buildingId && unit.label === data.label,
      );
      if (exists) {
        const error = new Error('Unique constraint failed');
        (error as { code?: string }).code = 'P2002';
        throw error;
      }

      const now = new Date();
      const unit: UnitRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        label: data.label,
        unitTypeId: data.unitTypeId ?? null,
        ownerId: data.ownerId ?? null,
        maintenancePayer: data.maintenancePayer ?? null,
        unitSize: data.unitSize ?? null,
        unitSizeUnit: data.unitSizeUnit ?? null,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        balcony: data.balcony ?? null,
        kitchenType: data.kitchenType ?? null,
        furnishedStatus: data.furnishedStatus ?? null,
        rentAnnual: data.rentAnnual ?? null,
        paymentFrequency: data.paymentFrequency ?? null,
        securityDepositAmount: data.securityDepositAmount ?? null,
        serviceChargePerUnit: data.serviceChargePerUnit ?? null,
        vatApplicable: data.vatApplicable ?? null,
        electricityMeterNumber: data.electricityMeterNumber ?? null,
        waterMeterNumber: data.waterMeterNumber ?? null,
        gasMeterNumber: data.gasMeterNumber ?? null,
        floor: data.floor ?? null,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.units.push(unit);
      return unit;
    },
    findMany: async ({ where }: { where: { buildingId: string } }) => {
      return this.units.filter((unit) => unit.buildingId === where.buildingId);
    },
    findFirst: async ({
      where,
      include,
    }: {
      where: { id: string; buildingId: string };
      include?: { amenities?: { include?: { amenity?: boolean } } };
    }) => {
      const unit =
        this.units.find(
          (unit) => unit.id === where.id && unit.buildingId === where.buildingId,
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
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<UnitRecord> & {
        owner?: { connect: { id: string } } | { disconnect: true };
        unitType?: { connect: { id: string } } | { disconnect: true };
      };
    }) => {
      const index = this.units.findIndex((unit) => unit.id === where.id);
      if (index === -1) {
        throw new Error('Unit not found');
      }
      const ownerId =
        data.owner === undefined
          ? this.units[index].ownerId
          : 'connect' in data.owner
            ? data.owner.connect.id
            : null;
      const unitTypeId =
        data.unitType === undefined
          ? this.units[index].unitTypeId
          : 'connect' in data.unitType
            ? data.unitType.connect.id
            : null;
      const updated: UnitRecord = {
        ...this.units[index],
        ...data,
        ownerId,
        unitTypeId,
        updatedAt: new Date(),
      };
      this.units[index] = updated;
      return updated;
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

  unitType = {
    findFirst: async ({
      where,
    }: {
      where: { id: string; orgId: string };
    }) => {
      return (
        this.unitTypes.find(
          (unitType) =>
            unitType.id === where.id && unitType.orgId === where.orgId,
        ) ?? null
      );
    },
    findMany: async ({
      where,
    }: {
      where: { orgId: string; isActive?: boolean };
    }) => {
      return this.unitTypes.filter(
        (unitType) =>
          unitType.orgId === where.orgId &&
          (where.isActive === undefined || unitType.isActive === where.isActive),
      );
    },
    create: async ({
      data,
    }: {
      data: { orgId: string; name: string; isActive?: boolean };
    }) => {
      const exists = this.unitTypes.find(
        (unitType) =>
          unitType.orgId === data.orgId && unitType.name === data.name,
      );
      if (exists) {
        const error = new Error('Unique constraint failed');
        (error as { code?: string }).code = 'P2002';
        throw error;
      }
      const now = new Date();
      const unitType: UnitTypeRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        name: data.name,
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      this.unitTypes.push(unitType);
      return unitType;
    },
  };

  owner = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const owner =
        this.owners.find((owner) => owner.id === where.id) ?? null;
      return owner ? { ...owner, party: null } : null;
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; orgId: string };
    }) => {
      return (
        this.owners.find(
          (owner) => owner.id === where.id && owner.orgId === where.orgId,
        ) ?? null
      );
    },
    findMany: async ({
      where,
    }: {
      where: { orgId: string; OR?: Array<Record<string, unknown>> };
    }) => {
      const base = this.owners.filter((owner) => owner.orgId === where.orgId);
      if (!where.OR) {
        return base;
      }
      const search = where.OR
        .map((entry) => Object.values(entry)[0])
        .find((value) => typeof value === 'object' && value !== null) as
        | { contains?: string }
        | undefined;
      const term = search?.contains?.toLowerCase();
      if (!term) {
        return base;
      }
      return base.filter((owner) => {
        const fields = [owner.name, owner.email, owner.phone, owner.address];
        return fields.some((value) =>
          value ? value.toLowerCase().includes(term) : false,
        );
      });
    },
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        name: string;
        email?: string;
        phone?: string;
        address?: string;
      };
    }) => {
      const now = new Date();
      const owner: OwnerRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        partyId: null,
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      this.owners.push(owner);
      return owner;
    },
  };

  reset() {
    this.orgs = [];
    this.roles = [];
    this.users = [];
    this.userRoles = [];
    this.permissions = [];
    this.rolePermissions = [];
    this.buildings = [];
    this.buildingAmenities = [];
    this.unitAmenities = [];
    this.units = [];
    this.unitTypes = [];
    this.owners = [];
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

describe('Org Units (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgAAdminId: string;
  let orgBAdminId: string;
  let buildingId: string;

  const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [
        PlatformOrgsController,
        BuildingsController,
        UnitsController,
        UnitTypesController,
        OwnersController,
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
        UnitTypesService,
        UnitTypesRepo,
        OwnersService,
        {
          provide: OwnerProvisioningService,
          useValue: {
            createOrReuseOwner: async ({
              orgId,
              dto,
            }: {
              orgId: string;
              dto: {
                name: string;
                email?: string;
                phone?: string;
                address?: string;
              };
            }) =>
              prisma.owner.create({
                data: {
                  orgId,
                  name: dto.name,
                  email: dto.email,
                  phone: dto.phone,
                  address: dto.address,
                },
              }),
          },
        },
        OwnersRepo,
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
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    prisma.reset();
    prisma.seedOrgAdminRole();

    const orgA = await prisma.org.create({ data: { name: 'Org A' } });
    const orgB = await prisma.org.create({ data: { name: 'Org B' } });

    const orgAAdmin = await prisma.user.create({
      data: {
        email: 'admin-a@org.test',
        passwordHash: 'hash',
        name: 'Org A Admin',
        orgId: orgA.id,
        isActive: true,
      },
    });
    const orgBAdmin = await prisma.user.create({
      data: {
        email: 'admin-b@org.test',
        passwordHash: 'hash',
        name: 'Org B Admin',
        orgId: orgB.id,
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
    orgBAdminId = orgBAdmin.id;
    buildingId = building.id;
  });

  it('org admin can create and list units', async () => {
    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ label: 'A-101', floor: 1 }),
      },
    );

    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    expect(createBody.label).toBe('A-101');

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );

    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(1);
  });

  it('creates units with extended fields and returns full detail', async () => {
    const unitTypeResponse = await fetch(`${baseUrl}/org/unit-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Apartment' }),
    });
    expect(unitTypeResponse.status).toBe(201);
    const unitTypeBody = await unitTypeResponse.json();

    const ownerResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({
        name: 'Jane Owner',
        email: 'jane@owner.test',
        phone: '+971555000111',
        address: 'Owner Address',
      }),
    });
    expect(ownerResponse.status).toBe(201);
    const ownerBody = await ownerResponse.json();

    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({
          label: 'B-202',
          floor: 2,
          unitTypeId: unitTypeBody.id,
          ownerId: ownerBody.id,
          maintenancePayer: 'OWNER',
          unitSize: 950,
          unitSizeUnit: 'SQ_FT',
          bedrooms: 2,
          bathrooms: 2,
          balcony: true,
          kitchenType: 'OPEN',
          furnishedStatus: 'FULLY_FURNISHED',
          rentAnnual: 120000,
          paymentFrequency: 'MONTHLY',
          securityDepositAmount: 5000,
          serviceChargePerUnit: 1500,
          vatApplicable: true,
          electricityMeterNumber: 'ELEC-123',
          waterMeterNumber: 'WATER-456',
          gasMeterNumber: 'GAS-789',
        }),
      },
    );

    expect(createResponse.status).toBe(201);
    const createdUnit = await createResponse.json();

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createdUnit.id}`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.unitTypeId).toBe(unitTypeBody.id);
    expect(detailBody.ownerId).toBe(ownerBody.id);
    expect(detailBody.maintenancePayer).toBe('OWNER');
    expect(detailBody.unitSize).toBe('950');
    expect(detailBody.unitSizeUnit).toBe('SQ_FT');
    expect(detailBody.balcony).toBe(true);
    expect(detailBody.rentAnnual).toBe('120000');
    expect(detailBody.vatApplicable).toBe(true);
  });

  it('updates a unit ownerId during the transition and returns the updated owner in detail responses', async () => {
    const unitTypeResponse = await fetch(`${baseUrl}/org/unit-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Apartment' }),
    });
    expect(unitTypeResponse.status).toBe(201);
    const unitTypeBody = await unitTypeResponse.json();

    const firstOwnerResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({
        name: 'Owner One',
        email: 'owner.one@org.test',
      }),
    });
    expect(firstOwnerResponse.status).toBe(201);
    const firstOwnerBody = await firstOwnerResponse.json();

    const secondOwnerResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({
        name: 'Owner Two',
        email: 'owner.two@org.test',
      }),
    });
    expect(secondOwnerResponse.status).toBe(201);
    const secondOwnerBody = await secondOwnerResponse.json();

    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({
          label: 'B-303',
          floor: 3,
          unitTypeId: unitTypeBody.id,
          ownerId: firstOwnerBody.id,
        }),
      },
    );
    expect(createResponse.status).toBe(201);
    const createdUnit = await createResponse.json();

    const updateResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createdUnit.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({
          ownerId: secondOwnerBody.id,
        }),
      },
    );
    expect(updateResponse.status).toBe(200);
    const updatedBody = await updateResponse.json();
    expect(updatedBody.ownerId).toBe(secondOwnerBody.id);

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${createdUnit.id}`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.ownerId).toBe(secondOwnerBody.id);
  });

  it('imports units from CSV (dry-run + create)', async () => {
    const unitTypeResponse = await fetch(`${baseUrl}/org/unit-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Apartment' }),
    });
    expect(unitTypeResponse.status).toBe(201);

    const csv = [
      'label,floor,unitType,bedrooms,bathrooms,unitSize,unitSizeUnit,balcony',
      'C-301,3,Apartment,2,2,950,SQ_FT,true',
    ].join('\n');

    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'units.csv');

    const dryRunResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/import?dryRun=true`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAAdminId },
        body: form,
      },
    );

    expect(dryRunResponse.status).toBe(201);
    const dryRunBody = await dryRunResponse.json();
    expect(dryRunBody).toMatchObject({
      dryRun: true,
      summary: { totalRows: 1, validRows: 1, created: 0, updated: 0 },
    });
    expect(dryRunBody.errors).toHaveLength(0);

    const form2 = new FormData();
    form2.append('file', new Blob([csv], { type: 'text/csv' }), 'units.csv');

    const importResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/import`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAAdminId },
        body: form2,
      },
    );

    expect(importResponse.status).toBe(201);
    const importBody = await importResponse.json();
    expect(importBody.summary.created).toBe(1);
    expect(importBody.errors).toHaveLength(0);

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.some((u: { label: string }) => u.label === 'C-301')).toBe(
      true,
    );
  });

  it('imports the shipped units template with a valid sample row', async () => {
    const unitTypeResponse = await fetch(`${baseUrl}/org/unit-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Apartment' }),
    });
    expect(unitTypeResponse.status).toBe(201);

    const templatePath = resolve(process.cwd(), 'units_template_fixed.csv');
    const templateHeader = readFileSync(templatePath, 'utf-8').trim();
    const csv = [
      templateHeader,
      [
        'T-401',
        '4',
        ' apartment ',
        'Template import validation row',
        '2',
        '3',
        '1200.5',
        'sq ft',
        'semi furnished',
        'yes',
        'open',
        '96000',
        'semi-annual',
        '8000',
        '1500',
        'no',
        'building',
        'ELEC-T401',
        'WATER-T401',
        'GAS-T401',
      ].join(','),
    ].join('\n');

    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'units.csv');

    const importResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/import`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAAdminId },
        body: form,
      },
    );

    expect(importResponse.status).toBe(201);
    const importBody = await importResponse.json();
    expect(importBody).toMatchObject({
      dryRun: false,
      mode: 'create',
      summary: { totalRows: 1, validRows: 1, created: 1, updated: 0 },
      errors: [],
    });

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(detailResponse.status).toBe(200);
    const units = await detailResponse.json();
    const importedUnit = units.find(
      (u: { label: string }) => u.label === 'T-401',
    );
    expect(importedUnit).toBeDefined();

    const unitDetails = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/${importBody.unitIds[0]}`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(unitDetails.status).toBe(200);
    const unitBody = await unitDetails.json();
    expect(unitBody).toMatchObject({
      label: 'T-401',
      floor: 4,
      notes: 'Template import validation row',
      bedrooms: 2,
      bathrooms: 3,
      unitSize: '1200.5',
      unitSizeUnit: 'SQ_FT',
      furnishedStatus: 'SEMI_FURNISHED',
      balcony: true,
      kitchenType: 'OPEN',
      rentAnnual: '96000',
      paymentFrequency: 'SEMI_ANNUAL',
      securityDepositAmount: '8000',
      serviceChargePerUnit: '1500',
      vatApplicable: false,
      maintenancePayer: 'BUILDING',
      electricityMeterNumber: 'ELEC-T401',
      waterMeterNumber: 'WATER-T401',
      gasMeterNumber: 'GAS-T401',
    });
  });

  it('import CSV returns errors and does not write when duplicates exist (create mode)', async () => {
    await fetch(`${baseUrl}/org/buildings/${buildingId}/units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ label: 'D-101', floor: 1 }),
    });

    const csv = ['label,floor', 'D-101,2'].join('\n');
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'units.csv');

    const importResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/import`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAAdminId },
        body: form,
      },
    );

    expect(importResponse.status).toBe(201);
    const importBody = await importResponse.json();
    expect(importBody.summary.created).toBe(0);
    expect(importBody.errors.length).toBeGreaterThan(0);

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    const unit = listBody.find((u: { label: string }) => u.label === 'D-101');
    expect(unit.floor).toBe(1);
  });

  it('returns basic units with id and label only', async () => {
    await fetch(`${baseUrl}/org/buildings/${buildingId}/units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ label: 'B-101' }),
    });

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units/basic`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(1);
    expect(Object.keys(listBody[0]).sort()).toEqual(['id', 'label']);
  });

  it('creates and lists unit types and owners', async () => {
    const createTypeResponse = await fetch(`${baseUrl}/org/unit-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Office' }),
    });
    expect(createTypeResponse.status).toBe(201);

    const listTypesResponse = await fetch(`${baseUrl}/org/unit-types`, {
      headers: { 'x-user-id': orgAAdminId },
    });
    expect(listTypesResponse.status).toBe(200);
    const unitTypesBody = await listTypesResponse.json();
    expect(unitTypesBody).toHaveLength(1);

    const createOwnerResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ name: 'Owner One', email: 'owner@org.test' }),
    });
    expect(createOwnerResponse.status).toBe(201);

    const listOwnersResponse = await fetch(
      `${baseUrl}/org/owners?search=owner`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(listOwnersResponse.status).toBe(200);
    const ownersBody = await listOwnersResponse.json();
    expect(ownersBody).toHaveLength(1);
  });

  it('keeps /org/owners fuzzy search org-local', async () => {
    const sharedName = 'Shared Owner Search';

    const createOrgAOwner = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({
        name: sharedName,
        email: 'shared-a@org.test',
        phone: '+971500000001',
      }),
    });
    expect(createOrgAOwner.status).toBe(201);

    const createOrgBOwner = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgBAdminId,
      },
      body: JSON.stringify({
        name: sharedName,
        email: 'shared-b@org.test',
        phone: '+971500000002',
      }),
    });
    expect(createOrgBOwner.status).toBe(201);

    const orgAListResponse = await fetch(
      `${baseUrl}/org/owners?search=shared`,
      {
        headers: { 'x-user-id': orgAAdminId },
      },
    );
    expect(orgAListResponse.status).toBe(200);
    const orgAOwners = await orgAListResponse.json();
    expect(orgAOwners).toHaveLength(1);
    expect(orgAOwners[0].email).toBe('shared-a@org.test');

    const orgBListResponse = await fetch(
      `${baseUrl}/org/owners?search=shared`,
      {
        headers: { 'x-user-id': orgBAdminId },
      },
    );
    expect(orgBListResponse.status).toBe(200);
    const orgBOwners = await orgBListResponse.json();
    expect(orgBOwners).toHaveLength(1);
    expect(orgBOwners[0].email).toBe('shared-b@org.test');
  });

  it('keeps /org/* auth org-scoped by rejecting users without org context', async () => {
    const orglessUser = await prisma.user.create({
      data: {
        email: 'orgless@user.test',
        passwordHash: 'hash',
        name: 'Orgless User',
        orgId: null,
        isActive: true,
      },
    });

    const listOwnersResponse = await fetch(`${baseUrl}/org/owners`, {
      headers: { 'x-user-id': orglessUser.id },
    });

    expect(listOwnersResponse.status).toBe(403);
  });

  it('org b admin cannot access org a building or units', async () => {
    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}`,
      {
        headers: { 'x-user-id': orgBAdminId },
      },
    );
    expect(detailResponse.status).toBe(404);

    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgBAdminId,
        },
        body: JSON.stringify({ label: 'B-201' }),
      },
    );
    expect(createResponse.status).toBe(404);

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        headers: { 'x-user-id': orgBAdminId },
      },
    );
    expect(listResponse.status).toBe(404);
  });

  it('returns 409 for duplicate unit labels in same building', async () => {
    await fetch(`${baseUrl}/org/buildings/${buildingId}/units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAAdminId,
      },
      body: JSON.stringify({ label: 'A-101' }),
    });

    const duplicateResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({ label: 'A-101' }),
      },
    );

    expect(duplicateResponse.status).toBe(409);
  });

  it('returns 400 for invalid payloads', async () => {
    const response = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/units`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAAdminId,
        },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
  });
});

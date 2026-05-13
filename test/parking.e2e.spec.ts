import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { ParkingController } from '../src/modules/parking/parking.controller';
import { ParkingRepo } from '../src/modules/parking/parking.repo';
import { ParkingService } from '../src/modules/parking/parking.service';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { BuildingsService } from '../src/modules/buildings/buildings.service';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type OrgRecord = {
  id: string;
  name: string;
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

type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: string;
  startAt: Date;
  endAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
};

type ParkingSlotRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  code: string;
  level?: string | null;
  type: string;
  isCovered: boolean;
  isActive: boolean;
  createdAt: Date;
};

type ParkingAllocationRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  parkingSlotId: string;
  occupancyId: string | null;
  unitId: string | null;
  startDate: Date;
  endDate?: Date | null;
  createdAt: Date;
};

type VehicleRecord = {
  id: string;
  orgId: string;
  occupancyId: string;
  plateNumber: string;
  label?: string | null;
  createdAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private occupancies: OccupancyRecord[] = [];
  private units: UnitRecord[] = [];
  private parkingSlots: ParkingSlotRecord[] = [];
  private parkingAllocations: ParkingAllocationRecord[] = [];
  private vehicles: VehicleRecord[] = [];

  reset() {
    this.orgs = [];
    this.buildings = [];
    this.occupancies = [];
    this.units = [];
    this.parkingSlots = [];
    this.parkingAllocations = [];
    this.vehicles = [];
  }

  async $transaction<T>(
    fn: (tx: InMemoryPrismaService) => Promise<T>,
  ): Promise<T> {
    return fn(this);
  }

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

  building = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        name: string;
        city: string;
        emirate?: string;
        country: string;
        timezone: string;
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
        floors: null,
        unitsCount: null,
        createdAt: now,
        updatedAt: now,
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

  occupancy = {
    create: async ({
      data,
    }: {
      data: {
        buildingId: string;
        unitId: string;
        residentUserId: string;
        status: string;
        startAt: Date;
      };
    }) => {
      const now = new Date();
      const occupancy: OccupancyRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        unitId: data.unitId,
        residentUserId: data.residentUserId,
        status: data.status,
        startAt: data.startAt,
        endAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.occupancies.push(occupancy);
      return occupancy;
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; building: { orgId: string } };
    }) => {
      const occupancy = this.occupancies.find((o) => o.id === where.id);
      if (!occupancy) return null;
      const building = this.buildings.find(
        (b) =>
          b.id === occupancy.buildingId && b.orgId === where.building.orgId,
      );
      if (!building) return null;
      return occupancy;
    },
  };

  lease = {
    findFirst: async ({
      where,
      select,
    }: {
      where: { orgId: string; occupancyId: string; status: 'ACTIVE' };
      select?: { id?: boolean };
    }) => {
      const occupancy = this.occupancies.find(
        (record) =>
          record.id === where.occupancyId && record.status === where.status,
      );
      if (!occupancy) {
        return null;
      }
      const building = this.buildings.find(
        (record) =>
          record.id === occupancy.buildingId && record.orgId === where.orgId,
      );
      if (!building) {
        return null;
      }
      return select?.id ? { id: `lease-${occupancy.id}` } : { id: `lease-${occupancy.id}` };
    },
  };

  leaseActivity = {
    create: async ({ data }: { data: unknown }) => data,
  };

  unit = {
    create: async ({
      data,
    }: {
      data: {
        buildingId: string;
        label: string;
      };
    }) => {
      const now = new Date();
      const unit: UnitRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        label: data.label,
        createdAt: now,
        updatedAt: now,
      };
      this.units.push(unit);
      return unit;
    },
    findFirst: async ({ where }: { where: any }) => {
      const unit = this.units.find((u) => u.id === where.id);
      if (!unit) return null;

      if (typeof where.buildingId === 'string') {
        return unit.buildingId === where.buildingId ? unit : null;
      }

      if (where.building?.orgId) {
        const building = this.buildings.find(
          (b) => b.id === unit.buildingId && b.orgId === where.building.orgId,
        );
        return building ? unit : null;
      }

      return unit;
    },
  };

  parkingSlot = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        buildingId: string;
        code: string;
        level?: string | null;
        type: string;
        isCovered: boolean;
        isActive: boolean;
      };
    }) => {
      const now = new Date();
      const slot: ParkingSlotRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        buildingId: data.buildingId,
        code: data.code,
        level: data.level ?? null,
        type: data.type,
        isCovered: data.isCovered,
        isActive: data.isActive,
        createdAt: now,
      };
      this.parkingSlots.push(slot);
      return slot;
    },
    findFirst: async ({ where }: { where: { id: string; orgId: string } }) => {
      return (
        this.parkingSlots.find(
          (s) => s.id === where.id && s.orgId === where.orgId,
        ) ?? null
      );
    },
    findMany: async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where: {
        orgId: string;
        buildingId: string;
        isActive?: boolean;
        id?: { in: string[] };
        allocations?: { none: { endDate: null } };
      };
      orderBy?: unknown;
      take?: number;
      select?: { id?: boolean; code?: boolean };
    }) => {
      let slots = this.parkingSlots.filter(
        (s) => s.orgId === where.orgId && s.buildingId === where.buildingId,
      );

      if (where.isActive !== undefined) {
        slots = slots.filter((s) => s.isActive === where.isActive);
      }

      if (where.id?.in) {
        slots = slots.filter((s) => where.id!.in.includes(s.id));
      }

      if (where.allocations?.none?.endDate === null) {
        const activeAllocationSlotIds = this.parkingAllocations
          .filter((a) => a.endDate === null)
          .map((a) => a.parkingSlotId);
        slots = slots.filter((s) => !activeAllocationSlotIds.includes(s.id));
      }

      if (take) {
        slots = slots.slice(0, take);
      }

      if (select?.id || select?.code) {
        return slots.map((s) => ({
          ...(select?.id ? { id: s.id } : {}),
          ...(select?.code ? { code: s.code } : {}),
        }));
      }

      return slots;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ParkingSlotRecord>;
    }) => {
      const index = this.parkingSlots.findIndex((s) => s.id === where.id);
      if (index === -1) throw new Error('Slot not found');
      this.parkingSlots[index] = { ...this.parkingSlots[index], ...data };
      return this.parkingSlots[index];
    },
  };

  parkingAllocation = {
    createMany: async ({
      data,
    }: {
      data: Array<{
        orgId: string;
        buildingId: string;
        parkingSlotId: string;
        occupancyId?: string;
        unitId?: string;
        startDate: Date;
        endDate: null;
      }>;
      skipDuplicates: boolean;
    }) => {
      const now = new Date();
      for (const item of data) {
        const allocation: ParkingAllocationRecord = {
          id: randomUUID(),
          orgId: item.orgId,
          buildingId: item.buildingId,
          parkingSlotId: item.parkingSlotId,
          occupancyId: item.occupancyId ?? null,
          unitId: item.unitId ?? null,
          startDate: item.startDate,
          endDate: null,
          createdAt: now,
        };
        this.parkingAllocations.push(allocation);
      }
      return { count: data.length };
    },
    findMany: async ({
      where,
      include,
    }: {
      where: {
        orgId?: string;
        buildingId?: string;
        occupancyId?: string;
        unitId?: string;
        parkingSlotId?: { in: string[] };
        startDate?: Date;
        endDate?: null;
      };
      include?: { parkingSlot: boolean };
    }) => {
      let allocations = where.orgId
        ? this.parkingAllocations.filter((a) => a.orgId === where.orgId)
        : this.parkingAllocations;

      if (where.buildingId) {
        allocations = allocations.filter(
          (a) => a.buildingId === where.buildingId,
        );
      }

      if (where.occupancyId) {
        allocations = allocations.filter(
          (a) => a.occupancyId === where.occupancyId,
        );
      }

      if (where.unitId) {
        allocations = allocations.filter((a) => a.unitId === where.unitId);
      }

      if (where.parkingSlotId?.in) {
        allocations = allocations.filter((a) =>
          where.parkingSlotId!.in.includes(a.parkingSlotId),
        );
      }

      if (where.startDate) {
        allocations = allocations.filter(
          (a) => a.startDate.getTime() === where.startDate!.getTime(),
        );
      }

      if (where.endDate === null) {
        allocations = allocations.filter((a) => a.endDate === null);
      }

      if (include?.parkingSlot) {
        return allocations.map((a) => ({
          ...a,
          parkingSlot: this.parkingSlots.find((s) => s.id === a.parkingSlotId)!,
        }));
      }

      return allocations;
    },
    findFirst: async ({
      where,
      include,
    }: {
      where: { id: string; orgId: string };
      include?: { parkingSlot: boolean };
    }) => {
      const allocation = this.parkingAllocations.find(
        (a) => a.id === where.id && a.orgId === where.orgId,
      );
      if (!allocation) return null;

      if (include?.parkingSlot) {
        return {
          ...allocation,
          parkingSlot: this.parkingSlots.find(
            (s) => s.id === allocation.parkingSlotId,
          )!,
        };
      }

      return allocation;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { endDate: Date };
    }) => {
      const index = this.parkingAllocations.findIndex((a) => a.id === where.id);
      if (index === -1) throw new Error('Allocation not found');
      this.parkingAllocations[index] = {
        ...this.parkingAllocations[index],
        ...data,
      };
      return this.parkingAllocations[index];
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        orgId: string;
        occupancyId?: string;
        unitId?: string;
        endDate: null;
      };
      data: { endDate: Date };
    }) => {
      let count = 0;
      for (let i = 0; i < this.parkingAllocations.length; i++) {
        const a = this.parkingAllocations[i];
        if (
          a.orgId === where.orgId &&
          (where.occupancyId === undefined ||
            a.occupancyId === where.occupancyId) &&
          (where.unitId === undefined || a.unitId === where.unitId) &&
          a.endDate === null
        ) {
          this.parkingAllocations[i] = { ...a, endDate: data.endDate };
          count++;
        }
      }
      return { count };
    },
  };

  vehicle = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        occupancyId: string;
        plateNumber: string;
        label?: string | null;
      };
    }) => {
      const now = new Date();
      const vehicle: VehicleRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        occupancyId: data.occupancyId,
        plateNumber: data.plateNumber,
        label: data.label ?? null,
        createdAt: now,
      };
      this.vehicles.push(vehicle);
      return vehicle;
    },
    findMany: async ({
      where,
    }: {
      where: { orgId: string; occupancyId: string };
    }) => {
      return this.vehicles.filter(
        (v) => v.orgId === where.orgId && v.occupancyId === where.occupancyId,
      );
    },
    findFirst: async ({ where }: { where: { id: string; orgId: string } }) => {
      return (
        this.vehicles.find(
          (v) => v.id === where.id && v.orgId === where.orgId,
        ) ?? null
      );
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<VehicleRecord>;
    }) => {
      const index = this.vehicles.findIndex((v) => v.id === where.id);
      if (index === -1) throw new Error('Vehicle not found');
      this.vehicles[index] = { ...this.vehicles[index], ...data };
      return this.vehicles[index];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.vehicles.findIndex((v) => v.id === where.id);
      if (index === -1) throw new Error('Vehicle not found');
      const deleted = this.vehicles[index];
      this.vehicles.splice(index, 1);
      return deleted;
    },
  };
}

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const orgHeader = request.headers['x-org-id'];
    const orgId = Array.isArray(orgHeader) ? orgHeader[0] : orgHeader;
    const hasPermissionsHeader = request.headers['x-has-permissions'];
    const hasPermissions =
      hasPermissionsHeader === undefined || hasPermissionsHeader === 'true';
    request.user = {
      sub: 'user-1',
      email: 'user@example.com',
      orgId: orgId ?? undefined,
    };
    request.effectivePermissions = hasPermissions
      ? new Set([
          'parkingSlots.create',
          'parkingSlots.read',
          'parkingSlots.update',
          'parkingAllocations.create',
          'parkingAllocations.read',
          'parkingAllocations.end',
          'vehicles.create',
          'vehicles.read',
          'vehicles.update',
          'vehicles.delete',
        ])
      : new Set();
    return true;
  }
}

@Injectable()
class TestPermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const permissions = request.effectivePermissions;
    if (!permissions) return false;

    // Get required permissions from metadata
    const handler = context.getHandler();
    const requiredPermissions =
      Reflect.getMetadata('permissions', handler) || [];

    if (requiredPermissions.length === 0) return true;

    return requiredPermissions.every((perm: string) => permissions.has(perm));
  }
}

describe('Parking (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [ParkingController],
      providers: [
        ParkingService,
        ParkingRepo,
        BuildingsService,
        BuildingsRepo,
        UnitsRepo,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(TestPermissionsGuard)
      .overrideGuard(OrgScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.reset();
  });

  describe('Org isolation', () => {
    it('should not allow org B to list org A slots', async () => {
      const orgA = await prisma.org.create({ data: { name: 'Org A' } });
      const orgB = await prisma.org.create({ data: { name: 'Org B' } });
      const buildingA = await prisma.building.create({
        data: {
          orgId: orgA.id,
          name: 'Building A',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      await prisma.parkingSlot.create({
        data: {
          orgId: orgA.id,
          buildingId: buildingA.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });

      const response = await fetch(
        `${baseUrl}/org/buildings/${buildingA.id}/parking-slots`,
        {
          headers: { 'x-org-id': orgB.id },
        },
      );

      expect(response.status).toBe(404);
    });

    it('should not allow org B to allocate org A slots', async () => {
      const orgA = await prisma.org.create({ data: { name: 'Org A' } });
      const orgB = await prisma.org.create({ data: { name: 'Org B' } });
      const buildingA = await prisma.building.create({
        data: {
          orgId: orgA.id,
          name: 'Building A',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      const occupancyA = await prisma.occupancy.create({
        data: {
          buildingId: buildingA.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });

      const response = await fetch(
        `${baseUrl}/org/buildings/${buildingA.id}/parking-allocations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': orgB.id,
          },
          body: JSON.stringify({ occupancyId: occupancyA.id, count: 1 }),
        },
      );

      expect(response.status).toBe(404);
    });

    it('should not allow org B to end org A allocations', async () => {
      const orgA = await prisma.org.create({ data: { name: 'Org A' } });
      const orgB = await prisma.org.create({ data: { name: 'Org B' } });
      const buildingA = await prisma.building.create({
        data: {
          orgId: orgA.id,
          name: 'Building A',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      const slotA = await prisma.parkingSlot.create({
        data: {
          orgId: orgA.id,
          buildingId: buildingA.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      const occupancyA = await prisma.occupancy.create({
        data: {
          buildingId: buildingA.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });
      await prisma.parkingAllocation.createMany({
        data: [
          {
            orgId: orgA.id,
            buildingId: buildingA.id,
            parkingSlotId: slotA.id,
            occupancyId: occupancyA.id,
            startDate: new Date(),
            endDate: null,
          },
        ],
        skipDuplicates: false,
      });
      const [allocation] = await prisma.parkingAllocation.findMany({
        where: { orgId: orgA.id, occupancyId: occupancyA.id },
      });

      const response = await fetch(
        `${baseUrl}/org/parking-allocations/${allocation.id}/end`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': orgB.id,
          },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(404);
    });
  });

  describe('ParkingSlot flows', () => {
    it('should create and list parking slots', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });

      const createResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({ code: 'A-01', type: 'CAR', isCovered: false }),
        },
      );

      expect(createResponse.status).toBe(201);
      const createBody = await createResponse.json();
      expect(createBody).toMatchObject({
        code: 'A-01',
        type: 'CAR',
        isCovered: false,
        isActive: true,
      });

      const listResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots`,
        {
          headers: { 'x-org-id': org.id },
        },
      );

      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json();
      expect(listBody).toHaveLength(1);
      expect(listBody[0]).toMatchObject({ code: 'A-01' });
    });

    it('should list available slots only', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      const slot1 = await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-02',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      const occupancy = await prisma.occupancy.create({
        data: {
          buildingId: building.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });
      await prisma.parkingAllocation.createMany({
        data: [
          {
            orgId: org.id,
            buildingId: building.id,
            parkingSlotId: slot1.id,
            occupancyId: occupancy.id,
            startDate: new Date(),
            endDate: null,
          },
        ],
        skipDuplicates: false,
      });

      const response = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots?available=true`,
        {
          headers: { 'x-org-id': org.id },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ code: 'A-02' });
    });
  });

  describe('Allocation flows', () => {
    it('should allocate count=2 and reduce available slots', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-02',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-03',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      const occupancy = await prisma.occupancy.create({
        data: {
          buildingId: building.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });

      const allocateResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-allocations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({ occupancyId: occupancy.id, count: 2 }),
        },
      );

      expect(allocateResponse.status).toBe(201);
      const allocateBody = await allocateResponse.json();
      expect(allocateBody).toHaveLength(2);

      const availableResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots?available=true`,
        {
          headers: { 'x-org-id': org.id },
        },
      );

      expect(availableResponse.status).toBe(200);
      const availableBody = await availableResponse.json();
      expect(availableBody).toHaveLength(1);
    });

    it('should allocate slots to a unit without an occupancy', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      const unit = await prisma.unit.create({
        data: { buildingId: building.id, label: '101' },
      });
      const slot1 = await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      const slot2 = await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-02',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });

      const allocateResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-allocations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({
            unitId: unit.id,
            slotIds: [slot1.id, slot2.id],
          }),
        },
      );

      expect(allocateResponse.status).toBe(201);
      const allocateBody = await allocateResponse.json();
      expect(allocateBody).toHaveLength(2);
      expect(allocateBody[0]).toMatchObject({
        unitId: unit.id,
        occupancyId: null,
      });

      const listResponse = await fetch(
        `${baseUrl}/org/units/${unit.id}/parking-allocations?active=true`,
        {
          headers: { 'x-org-id': org.id },
        },
      );

      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json();
      expect(listBody).toHaveLength(2);

      const endAllResponse = await fetch(
        `${baseUrl}/org/units/${unit.id}/parking-allocations/end-all`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({}),
        },
      );

      expect(endAllResponse.status).toBe(201);
      const endAllBody = await endAllResponse.json();
      expect(endAllBody).toMatchObject({ ended: 2 });

      const availableResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots?available=true`,
        {
          headers: { 'x-org-id': org.id },
        },
      );

      expect(availableResponse.status).toBe(200);
      const availableBody = await availableResponse.json();
      expect(availableBody).toHaveLength(2);
    });

    it('should return 409 when allocating already allocated slot', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      const slot = await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      const occupancy = await prisma.occupancy.create({
        data: {
          buildingId: building.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });
      await prisma.parkingAllocation.createMany({
        data: [
          {
            orgId: org.id,
            buildingId: building.id,
            parkingSlotId: slot.id,
            occupancyId: occupancy.id,
            startDate: new Date(),
            endDate: null,
          },
        ],
        skipDuplicates: false,
      });

      const response = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-allocations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({
            occupancyId: occupancy.id,
            slotIds: [slot.id],
          }),
        },
      );

      expect(response.status).toBe(409);
    });

    it('should end one allocation and slot returns to available', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      const slot = await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      const occupancy = await prisma.occupancy.create({
        data: {
          buildingId: building.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });
      await prisma.parkingAllocation.createMany({
        data: [
          {
            orgId: org.id,
            buildingId: building.id,
            parkingSlotId: slot.id,
            occupancyId: occupancy.id,
            startDate: new Date(),
            endDate: null,
          },
        ],
        skipDuplicates: false,
      });
      const [allocation] = await prisma.parkingAllocation.findMany({
        where: { orgId: org.id, occupancyId: occupancy.id },
      });

      const endResponse = await fetch(
        `${baseUrl}/org/parking-allocations/${allocation.id}/end`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({}),
        },
      );

      expect(endResponse.status).toBe(201);

      const availableResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots?available=true`,
        {
          headers: { 'x-org-id': org.id },
        },
      );

      expect(availableResponse.status).toBe(200);
      const availableBody = await availableResponse.json();
      expect(availableBody).toHaveLength(1);
    });

    it('should end all allocations for occupancy', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-02',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });
      const occupancy = await prisma.occupancy.create({
        data: {
          buildingId: building.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });
      await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-allocations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({ occupancyId: occupancy.id, count: 2 }),
        },
      );

      const endAllResponse = await fetch(
        `${baseUrl}/org/occupancies/${occupancy.id}/parking-allocations/end-all`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
          },
          body: JSON.stringify({}),
        },
      );

      expect(endAllResponse.status).toBe(201);
      const endAllBody = await endAllResponse.json();
      expect(endAllBody).toMatchObject({ ended: 2 });

      const availableResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots?available=true`,
        {
          headers: { 'x-org-id': org.id },
        },
      );

      expect(availableResponse.status).toBe(200);
      const availableBody = await availableResponse.json();
      expect(availableBody).toHaveLength(2);
    });
  });

  describe('ParkingSlot import flows', () => {
    it('should dry-run and import parking slots from CSV', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });

      const csv = [
        'code,type,level,isCovered,isActive',
        'A-01,CAR,B1,true,true',
        'A-02,EV,B1,false,true',
      ].join('\n');

      const form = new FormData();
      form.append('file', new Blob([csv], { type: 'text/csv' }), 'slots.csv');

      const dryRunResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots/import?dryRun=true&mode=create`,
        {
          method: 'POST',
          headers: { 'x-org-id': org.id },
          body: form,
        },
      );

      expect(dryRunResponse.status).toBe(201);
      const dryRunBody = await dryRunResponse.json();
      expect(dryRunBody).toMatchObject({
        dryRun: true,
        summary: { totalRows: 2, validRows: 2, created: 0, updated: 0 },
      });
      expect(dryRunBody.errors).toHaveLength(0);

      const form2 = new FormData();
      form2.append('file', new Blob([csv], { type: 'text/csv' }), 'slots.csv');

      const importResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots/import?mode=create`,
        {
          method: 'POST',
          headers: { 'x-org-id': org.id },
          body: form2,
        },
      );

      expect(importResponse.status).toBe(201);
      const importBody = await importResponse.json();
      expect(importBody.summary.created).toBe(2);
      expect(importBody.errors).toHaveLength(0);

      const listResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots`,
        {
          headers: { 'x-org-id': org.id },
        },
      );
      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json();
      expect(listBody).toHaveLength(2);
      expect(listBody.map((s: { code: string }) => s.code).sort()).toEqual([
        'A-01',
        'A-02',
      ]);
    });

    it('should return errors and not write when duplicate codes exist (create mode)', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });

      await prisma.parkingSlot.create({
        data: {
          orgId: org.id,
          buildingId: building.id,
          code: 'A-01',
          type: 'CAR',
          isCovered: false,
          isActive: true,
        },
      });

      const csv = ['code,type', 'A-01,EV'].join('\n');
      const form = new FormData();
      form.append('file', new Blob([csv], { type: 'text/csv' }), 'slots.csv');

      const importResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots/import?mode=create`,
        {
          method: 'POST',
          headers: { 'x-org-id': org.id },
          body: form,
        },
      );

      expect(importResponse.status).toBe(201);
      const importBody = await importResponse.json();
      expect(importBody.summary.created).toBe(0);
      expect(importBody.errors.length).toBeGreaterThan(0);

      const listResponse = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots`,
        {
          headers: { 'x-org-id': org.id },
        },
      );
      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json();
      expect(listBody).toHaveLength(1);
      expect(listBody[0]).toMatchObject({ code: 'A-01', type: 'CAR' });
    });
  });

  describe('Permission enforcement', () => {
    it('should return 403 when creating slot without permission', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });

      const response = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-slots`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
            'x-has-permissions': 'false',
          },
          body: JSON.stringify({ code: 'A-01', type: 'CAR', isCovered: false }),
        },
      );

      expect(response.status).toBe(403);
    });

    it('should return 403 when creating allocation without permission', async () => {
      const org = await prisma.org.create({ data: { name: 'Test Org' } });
      const building = await prisma.building.create({
        data: {
          orgId: org.id,
          name: 'Test Building',
          city: 'Dubai',
          country: 'ARE',
          timezone: 'Asia/Dubai',
        },
      });
      const occupancy = await prisma.occupancy.create({
        data: {
          buildingId: building.id,
          unitId: randomUUID(),
          residentUserId: randomUUID(),
          status: 'ACTIVE',
          startAt: new Date(),
        },
      });

      const response = await fetch(
        `${baseUrl}/org/buildings/${building.id}/parking-allocations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-org-id': org.id,
            'x-has-permissions': 'false',
          },
          body: JSON.stringify({ occupancyId: occupancy.id, count: 1 }),
        },
      );

      expect(response.status).toBe(403);
    });
  });
});

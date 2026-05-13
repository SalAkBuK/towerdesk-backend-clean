import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OccupancyStatus, VisitorStatus, VisitorType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { BuildingScopeResolverService } from '../src/common/building-access/building-scope-resolver.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { NotificationTypeEnum } from '../src/modules/notifications/notifications.constants';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { BuildingsRepo } from '../src/modules/buildings/buildings.repo';
import { UnitsRepo } from '../src/modules/units/units.repo';
import { ResidentVisitorsController } from '../src/modules/visitors/resident-visitors.controller';
import { VisitorsController } from '../src/modules/visitors/visitors.controller';
import { VisitorsRepo } from '../src/modules/visitors/visitors.repo';
import { VisitorsService } from '../src/modules/visitors/visitors.service';

type OrgRecord = {
  id: string;
  name: string;
};

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
  name?: string | null;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
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
  status: OccupancyStatus;
  createdAt: Date;
};

type VisitorRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId: string;
  type: VisitorType;
  status: VisitorStatus;
  visitorName: string;
  phoneNumber: string;
  emiratesId: string | null;
  vehicleNumber: string | null;
  expectedArrivalAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BuildingAssignmentRecord = {
  id: string;
  buildingId: string;
  userId: string;
  type: 'MANAGER' | 'STAFF' | 'BUILDING_ADMIN';
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private units: UnitRecord[] = [];
  private occupancies: OccupancyRecord[] = [];
  private visitors: VisitorRecord[] = [];
  private assignments: BuildingAssignmentRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const org: OrgRecord = { id: randomUUID(), name: data.name };
      this.orgs.push(org);
      return org;
    },
  };

  user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.users.find((user) => user.id === where.id) ?? null,
    create: async ({
      data,
    }: {
      data: {
        email: string;
        orgId: string | null;
        isActive: boolean;
        name?: string | null;
      };
    }) => {
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        isActive: data.isActive,
        name: data.name ?? null,
      };
      this.users.push(user);
      return user;
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
    findFirst: async ({ where }: { where: { id?: string; orgId?: string } }) =>
      this.buildings.find((building) => {
        if (where.id && building.id !== where.id) {
          return false;
        }
        if (where.orgId && building.orgId !== where.orgId) {
          return false;
        }
        return true;
      }) ?? null,
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
    }) =>
      this.units.find((unit) => {
        if (where.id && unit.id !== where.id) {
          return false;
        }
        if (where.buildingId && unit.buildingId !== where.buildingId) {
          return false;
        }
        return true;
      }) ?? null,
  };

  occupancy = {
    create: async ({
      data,
    }: {
      data: {
        buildingId: string;
        unitId: string;
        residentUserId: string;
        status: OccupancyStatus;
      };
    }) => {
      const record: OccupancyRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        unitId: data.unitId,
        residentUserId: data.residentUserId,
        status: data.status,
        createdAt: new Date(),
      };
      this.occupancies.push(record);
      return record;
    },
    findFirst: async ({
      where,
    }: {
      where: {
        buildingId?: string;
        residentUserId?: string;
        status?: OccupancyStatus;
      };
    }) =>
      this.occupancies.find((occupancy) => {
        if (where.buildingId && occupancy.buildingId !== where.buildingId) {
          return false;
        }
        if (
          where.residentUserId &&
          occupancy.residentUserId !== where.residentUserId
        ) {
          return false;
        }
        if (where.status && occupancy.status !== where.status) {
          return false;
        }
        return true;
      }) ?? null,
    findMany: async ({
      where,
      select,
    }: {
      where?: {
        residentUserId?: string;
        status?: OccupancyStatus;
        building?: { orgId: string };
        unitId?: string;
      };
      select?: {
        buildingId?: boolean;
        unitId?: boolean;
      };
    }) => {
      const filtered = this.occupancies.filter((occupancy) => {
        if (
          where?.residentUserId &&
          occupancy.residentUserId !== where.residentUserId
        ) {
          return false;
        }
        if (where?.status && occupancy.status !== where.status) {
          return false;
        }
        if (where?.unitId && occupancy.unitId !== where.unitId) {
          return false;
        }
        if (where?.building?.orgId) {
          const building = this.buildings.find(
            (item) => item.id === occupancy.buildingId,
          );
          if (!building || building.orgId !== where.building.orgId) {
            return false;
          }
        }
        return true;
      });

      return filtered.map((occupancy) => {
        if (select?.buildingId || select?.unitId) {
          return {
            ...(select?.buildingId ? { buildingId: occupancy.buildingId } : {}),
            ...(select?.unitId ? { unitId: occupancy.unitId } : {}),
          };
        }
        return occupancy;
      });
    },
  };

  buildingAssignment = {
    findMany: async ({
      where,
    }: {
      where: { buildingId?: string; userId?: string };
    }) =>
      this.assignments.filter((assignment) => {
        if (where.buildingId && assignment.buildingId !== where.buildingId) {
          return false;
        }
        if (where.userId && assignment.userId !== where.userId) {
          return false;
        }
        return true;
      }),
  };

  visitor = {
    create: async ({
      data,
    }: {
      data: {
        org: { connect: { id: string } };
        building: { connect: { id: string } };
        unit: { connect: { id: string } };
        type: VisitorType;
        visitorName: string;
        phoneNumber: string;
        emiratesId?: string | null;
        vehicleNumber?: string | null;
        expectedArrivalAt?: Date;
        notes?: string | null;
      };
      include?: unknown;
    }) => {
      const now = new Date();
      const visitor: VisitorRecord = {
        id: randomUUID(),
        orgId: data.org.connect.id,
        buildingId: data.building.connect.id,
        unitId: data.unit.connect.id,
        type: data.type,
        status: VisitorStatus.EXPECTED,
        visitorName: data.visitorName,
        phoneNumber: data.phoneNumber,
        emiratesId: data.emiratesId ?? null,
        vehicleNumber: data.vehicleNumber ?? null,
        expectedArrivalAt: data.expectedArrivalAt ?? null,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.visitors.push(visitor);
      return this.hydrateVisitor(visitor);
    },
    findMany: async ({
      where,
    }: {
      where?: { buildingId?: string; unitId?: string; status?: VisitorStatus };
      include?: unknown;
      orderBy?: { createdAt: 'desc' | 'asc' };
    }) => {
      const filtered = this.visitors
        .filter((visitor) => {
          if (where?.buildingId && visitor.buildingId !== where.buildingId) {
            return false;
          }
          if (where?.unitId && visitor.unitId !== where.unitId) {
            return false;
          }
          if (where?.status && visitor.status !== where.status) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return filtered.map((visitor) => this.hydrateVisitor(visitor));
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; buildingId?: string; unitId?: string };
      include?: unknown;
    }) => {
      const visitor =
        this.visitors.find((item) => {
          if (where.id && item.id !== where.id) {
            return false;
          }
          if (where.buildingId && item.buildingId !== where.buildingId) {
            return false;
          }
          if (where.unitId && item.unitId !== where.unitId) {
            return false;
          }
          return true;
        }) ?? null;

      return visitor ? this.hydrateVisitor(visitor) : null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: {
        type?: VisitorType;
        status?: VisitorStatus;
        visitorName?: string;
        phoneNumber?: string;
        emiratesId?: string | null;
        vehicleNumber?: string | null;
        expectedArrivalAt?: Date | null;
        notes?: string | null;
        unit?: { connect: { id: string } };
      };
      include?: unknown;
    }) => {
      const visitor = this.visitors.find((item) => item.id === where.id);
      if (!visitor) {
        throw new Error('Visitor not found');
      }

      if (data.type !== undefined) visitor.type = data.type;
      if (data.status !== undefined) visitor.status = data.status;
      if (data.visitorName !== undefined)
        visitor.visitorName = data.visitorName;
      if (data.phoneNumber !== undefined)
        visitor.phoneNumber = data.phoneNumber;
      if (data.emiratesId !== undefined) visitor.emiratesId = data.emiratesId;
      if (data.vehicleNumber !== undefined) {
        visitor.vehicleNumber = data.vehicleNumber;
      }
      if (data.expectedArrivalAt !== undefined) {
        visitor.expectedArrivalAt = data.expectedArrivalAt;
      }
      if (data.notes !== undefined) visitor.notes = data.notes;
      if (data.unit?.connect?.id) {
        visitor.unitId = data.unit.connect.id;
      }
      visitor.updatedAt = new Date();
      return this.hydrateVisitor(visitor);
    },
  };

  reset() {
    this.orgs = [];
    this.users = [];
    this.buildings = [];
    this.units = [];
    this.occupancies = [];
    this.visitors = [];
    this.assignments = [];
  }

  private hydrateVisitor(visitor: VisitorRecord) {
    const unit = this.units.find((item) => item.id === visitor.unitId);
    if (!unit) {
      throw new Error('Unit not found');
    }

    const activeOccupancies = this.occupancies
      .filter(
        (occupancy) =>
          occupancy.unitId === unit.id &&
          occupancy.status === OccupancyStatus.ACTIVE,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 1)
      .map((occupancy) => ({
        ...occupancy,
        residentUser: this.users.find(
          (user) => user.id === occupancy.residentUserId,
        ),
      }));

    return {
      ...visitor,
      unit: {
        ...unit,
        occupancies: activeOccupancies,
      },
    };
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

describe('Visitors (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let notificationsService: { createForUsers: jest.Mock };
  let adminA: UserRecord;
  let residentA: UserRecord;
  let roommateA: UserRecord;
  let residentB: UserRecord;
  let residentC: UserRecord;
  let residentNoOccupancy: UserRecord;
  let buildingA: BuildingRecord;
  let buildingB: BuildingRecord;
  let unitA1: UnitRecord;
  let unitA2: UnitRecord;
  let unitB1: UnitRecord;

  const permissionsByUser = new Map<string, Set<string>>();

  const grantPermissions = (userId: string, permissions: string[]) => {
    permissionsByUser.set(userId, new Set(permissions));
  };

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();
    notificationsService = {
      createForUsers: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [VisitorsController, ResidentVisitorsController],
      providers: [
        VisitorsService,
        VisitorsRepo,
        BuildingsRepo,
        UnitsRepo,
        OrgScopeGuard,
        PermissionsGuard,
        BuildingAccessGuard,
        BuildingAccessService,
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
          provide: NotificationsService,
          useValue: notificationsService,
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
    notificationsService.createForUsers.mockClear();

    const orgA = await prisma.org.create({ data: { name: 'Org A' } });

    buildingA = await prisma.building.create({
      data: { orgId: orgA.id, name: 'Building A' },
    });
    buildingB = await prisma.building.create({
      data: { orgId: orgA.id, name: 'Building B' },
    });

    unitA1 = await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-101' },
    });
    unitA2 = await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-102' },
    });
    unitB1 = await prisma.unit.create({
      data: { buildingId: buildingB.id, label: 'B-201' },
    });

    adminA = await prisma.user.create({
      data: {
        email: 'admin@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Admin A',
      },
    });
    residentA = await prisma.user.create({
      data: {
        email: 'resident-a@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident A',
      },
    });
    roommateA = await prisma.user.create({
      data: {
        email: 'roommate-a@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Roommate A',
      },
    });
    residentB = await prisma.user.create({
      data: {
        email: 'resident-b@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident B',
      },
    });
    residentC = await prisma.user.create({
      data: {
        email: 'resident-c@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident C',
      },
    });
    residentNoOccupancy = await prisma.user.create({
      data: {
        email: 'resident-none@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident No Occupancy',
      },
    });

    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: residentA.id,
        status: OccupancyStatus.ACTIVE,
      },
    });
    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: roommateA.id,
        status: OccupancyStatus.ACTIVE,
      },
    });
    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA2.id,
        residentUserId: residentB.id,
        status: OccupancyStatus.ACTIVE,
      },
    });
    await prisma.occupancy.create({
      data: {
        buildingId: buildingB.id,
        unitId: unitB1.id,
        residentUserId: residentC.id,
        status: OccupancyStatus.ACTIVE,
      },
    });

    grantPermissions(adminA.id, [
      'visitors.create',
      'visitors.read',
      'visitors.update',
    ]);
    grantPermissions(residentA.id, [
      'resident.visitors.create',
      'resident.visitors.read',
      'resident.visitors.update',
      'resident.visitors.cancel',
    ]);
    grantPermissions(residentB.id, [
      'resident.visitors.read',
    ]);
    grantPermissions(residentC.id, [
      'resident.visitors.read',
    ]);
    grantPermissions(roommateA.id, [
      'resident.visitors.read',
    ]);
    grantPermissions(residentNoOccupancy.id, [
      'resident.visitors.create',
    ]);
  });

  it('resident create derives building and unit from active occupancy', async () => {
    const response = await fetch(`${baseUrl}/resident/visitors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'Alice Guest',
        phoneNumber: '1234567890',
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.buildingId).toBe(buildingA.id);
    expect(payload.unit).toEqual(
      expect.objectContaining({ id: unitA1.id, label: 'A-101' }),
    );
    expect(payload.status).toBe(VisitorStatus.EXPECTED);
  });

  it('roommates can list the same unit visitors, but not other unit visitors', async () => {
    const residentVisitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA1.id } },
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'Shared Guest',
        phoneNumber: '111',
      },
    });
    await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA2.id } },
        type: VisitorType.OTHER,
        visitorName: 'Other Unit Guest',
        phoneNumber: '222',
      },
    });

    const response = await fetch(`${baseUrl}/resident/visitors`, {
      headers: { 'x-user-id': roommateA.id },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toHaveLength(1);
    expect(payload[0].id).toBe(residentVisitor.id);
  });

  it('resident can fetch their unit visitor but not other unit or building visitors', async () => {
    const ownVisitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA1.id } },
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'Own Visitor',
        phoneNumber: '111',
      },
    });
    const otherUnitVisitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA2.id } },
        type: VisitorType.OTHER,
        visitorName: 'Other Unit Visitor',
        phoneNumber: '222',
      },
    });
    const otherBuildingVisitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingB.id } },
        unit: { connect: { id: unitB1.id } },
        type: VisitorType.OTHER,
        visitorName: 'Other Building Visitor',
        phoneNumber: '333',
      },
    });

    const ownResponse = await fetch(
      `${baseUrl}/resident/visitors/${ownVisitor.id}`,
      { headers: { 'x-user-id': residentA.id } },
    );
    expect(ownResponse.status).toBe(200);

    const otherUnitResponse = await fetch(
      `${baseUrl}/resident/visitors/${otherUnitVisitor.id}`,
      { headers: { 'x-user-id': residentA.id } },
    );
    expect(otherUnitResponse.status).toBe(404);

    const otherBuildingResponse = await fetch(
      `${baseUrl}/resident/visitors/${otherBuildingVisitor.id}`,
      { headers: { 'x-user-id': residentA.id } },
    );
    expect(otherBuildingResponse.status).toBe(404);
  });

  it('resident can update allowed visitor fields', async () => {
    const visitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA1.id } },
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'Before',
        phoneNumber: '111',
      },
    });

    const response = await fetch(`${baseUrl}/resident/visitors/${visitor.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        visitorName: 'After',
        notes: 'Bring ID',
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.visitorName).toBe('After');
    expect(payload.notes).toBe('Bring ID');
  });

  it('resident update rejects status changes to arrived or completed', async () => {
    const visitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA1.id } },
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'Status Test',
        phoneNumber: '111',
      },
    });

    for (const status of [VisitorStatus.ARRIVED, VisitorStatus.COMPLETED]) {
      const response = await fetch(
        `${baseUrl}/resident/visitors/${visitor.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': residentA.id,
          },
          body: JSON.stringify({ status }),
        },
      );

      expect(response.status).toBe(400);
    }
  });

  it('resident can cancel an expected visitor', async () => {
    const visitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA1.id } },
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'Cancelable',
        phoneNumber: '111',
      },
    });

    const response = await fetch(
      `${baseUrl}/resident/visitors/${visitor.id}/cancel`,
      {
        method: 'POST',
        headers: { 'x-user-id': residentA.id },
      },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe(VisitorStatus.CANCELLED);
  });

  it('resident cannot cancel non-expected visitors', async () => {
    const visitor = await prisma.visitor.create({
      data: {
        org: { connect: { id: adminA.orgId! } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA1.id } },
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'Arrived Visitor',
        phoneNumber: '111',
      },
    });
    await prisma.visitor.update({
      where: { id: visitor.id },
      data: { status: VisitorStatus.ARRIVED },
    });

    const response = await fetch(
      `${baseUrl}/resident/visitors/${visitor.id}/cancel`,
      {
        method: 'POST',
        headers: { 'x-user-id': residentA.id },
      },
    );

    expect(response.status).toBe(409);
  });

  it('resident without active occupancy gets 409 on create', async () => {
    const response = await fetch(`${baseUrl}/resident/visitors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentNoOccupancy.id,
      },
      body: JSON.stringify({
        type: VisitorType.GUEST_VISITOR,
        visitorName: 'No Unit',
        phoneNumber: '999',
      }),
    });

    expect(response.status).toBe(409);
  });

  it('org visitor endpoints still create, list, and update visitors', async () => {
    const createResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/visitors`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminA.id,
        },
        body: JSON.stringify({
          type: VisitorType.GUEST_VISITOR,
          visitorName: 'Ops Visitor',
          phoneNumber: '555',
          unitId: unitA2.id,
        }),
      },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/visitors`,
      {
        headers: { 'x-user-id': adminA.id },
      },
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload).toHaveLength(1);
    expect(listPayload[0].id).toBe(created.id);

    const updateResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/visitors/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminA.id,
        },
        body: JSON.stringify({
          status: VisitorStatus.ARRIVED,
        }),
      },
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.status).toBe(VisitorStatus.ARRIVED);
    expect(notificationsService.createForUsers).toHaveBeenCalledTimes(1);
    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: adminA.orgId,
      userIds: expect.arrayContaining([residentB.id]),
      type: NotificationTypeEnum.VISITOR_ARRIVED,
      title: 'Visitor arrived',
      body: 'Ops Visitor has arrived at unit A-102',
      data: {
        visitorId: created.id,
        buildingId: buildingA.id,
        unitId: unitA2.id,
        status: VisitorStatus.ARRIVED,
        visitorName: 'Ops Visitor',
        actorUserId: adminA.id,
      },
    });
  });
});

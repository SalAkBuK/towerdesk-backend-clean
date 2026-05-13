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
import { LeaseOccupantsController } from '../src/modules/leases/lease-occupants.controller';
import { LeaseOccupantsService } from '../src/modules/leases/lease-occupants.service';
import { LeaseActivityRepo } from '../src/modules/leases/lease-activity.repo';
import { LeaseOccupantsRepo } from '../src/modules/leases/lease-occupants.repo';
import { LeasesRepo } from '../src/modules/leases/leases.repo';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type OrgRecord = { id: string; name: string };
type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
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
  annualRent: string;
  paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  securityDepositAmount: string;
};
type LeaseOccupantRecord = {
  id: string;
  leaseId: string;
  name: string;
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

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private leases: LeaseRecord[] = [];
  private occupants: LeaseOccupantRecord[] = [];
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

  lease = {
    create: async ({ data }: { data: LeaseRecord }) => {
      this.leases.push({ ...data });
      return data;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; orgId?: string };
    }) => {
      return (
        this.leases.find((lease) => {
          if (where.id && lease.id !== where.id) return false;
          if (where.orgId && lease.orgId !== where.orgId) return false;
          return true;
        }) ?? null
      );
    },
  };

  $transaction = async (operations: unknown) => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    return (operations as (tx: this) => Promise<unknown>)(this);
  };

  leaseOccupant = {
    findMany: async ({
      where,
    }: {
      where: { leaseId: string };
      orderBy?: { createdAt?: 'asc' };
    }) => {
      return this.occupants
        .filter((occupant) => occupant.leaseId === where.leaseId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    deleteMany: async ({ where }: { where: { leaseId: string } }) => {
      this.occupants = this.occupants.filter(
        (occupant) => occupant.leaseId !== where.leaseId,
      );
      return { count: 0 };
    },
    createMany: async ({
      data,
    }: {
      data: { leaseId: string; name: string }[];
    }) => {
      const now = new Date();
      for (const item of data) {
        this.occupants.push({
          id: randomUUID(),
          leaseId: item.leaseId,
          name: item.name,
          createdAt: now,
        });
      }
      return { count: data.length };
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
      const record: LeaseActivityRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        source: data.source ?? 'USER',
        changedByUserId: data.changedByUserId ?? null,
        payload: data.payload,
        createdAt: new Date(),
      };
      this.leaseActivities.push(record);
      return record;
    },
  };

  reset() {
    this.orgs = [];
    this.users = [];
    this.leases = [];
    this.occupants = [];
    this.leaseActivities = [];
  }
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
    request.user = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId ?? null,
    };
    return true;
  }
}

describe('Lease occupants (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgA: OrgRecord;
  let orgB: OrgRecord;
  let userA: UserRecord;
  let leaseA: LeaseRecord;
  let leaseB: LeaseRecord;

  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [LeaseOccupantsController],
      providers: [
        LeaseOccupantsService,
        LeaseOccupantsRepo,
        LeaseActivityRepo,
        LeasesRepo,
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

    orgA = await prisma.org.create({ data: { name: 'Org A' } });
    orgB = await prisma.org.create({ data: { name: 'Org B' } });
    userA = await prisma.user.create({
      data: { email: 'user-a@org.test', orgId: orgA.id, isActive: true },
    });
    await prisma.user.create({
      data: { email: 'user-b@org.test', orgId: orgB.id, isActive: true },
    });

    leaseA = await prisma.lease.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        buildingId: randomUUID(),
        unitId: randomUUID(),
        occupancyId: randomUUID(),
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });
    leaseB = await prisma.lease.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        buildingId: randomUUID(),
        unitId: randomUUID(),
        occupancyId: randomUUID(),
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '130000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '6000.00',
      },
    });
  });

  it('blocks reads without permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/occupants`,
      { headers: { 'x-user-id': userA.id } },
    );
    expect(response.status).toBe(403);
  });

  it('returns 404 for foreign lease', async () => {
    permissionsByUser.set(userA.id, new Set(['leases.occupants.read']));
    const response = await fetch(
      `${baseUrl}/org/leases/${leaseB.id}/occupants`,
      { headers: { 'x-user-id': userA.id } },
    );
    expect(response.status).toBe(404);
  });

  it('rejects writes without permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/occupants`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ names: ['A'] }),
      },
    );
    expect(response.status).toBe(403);
  });

  it('replaces occupants list with cleaned names', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.occupants.read', 'leases.occupants.write']),
    );
    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/occupants`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({
          names: ['Alice ', ' bob', 'Alice', ''],
        }),
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(2);

    const list = await fetch(`${baseUrl}/org/leases/${leaseA.id}/occupants`, {
      headers: { 'x-user-id': userA.id },
    });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody).toHaveLength(2);

    const clearResponse = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/occupants`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ names: [] }),
      },
    );
    expect(clearResponse.status).toBe(200);
    const cleared = await clearResponse.json();
    expect(cleared).toEqual([]);
  });
});

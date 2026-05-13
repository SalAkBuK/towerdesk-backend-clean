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
import { LeaseAccessCardsController } from '../src/modules/leases/lease-access-cards.controller';
import { LeaseAccessCardsService } from '../src/modules/leases/lease-access-cards.service';
import { LeaseAccessCardsRepo } from '../src/modules/leases/lease-access-cards.repo';
import { LeaseParkingStickersController } from '../src/modules/leases/lease-parking-stickers.controller';
import { LeaseParkingStickersService } from '../src/modules/leases/lease-parking-stickers.service';
import { LeaseParkingStickersRepo } from '../src/modules/leases/lease-parking-stickers.repo';
import { LeaseActivityRepo } from '../src/modules/leases/lease-activity.repo';
import { LeasesRepo } from '../src/modules/leases/leases.repo';
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

type AccessCardRecord = {
  id: string;
  leaseId: string;
  cardNumber: string;
  status: 'ISSUED' | 'RETURNED' | 'DEACTIVATED';
  issuedAt: Date;
  returnedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ParkingStickerRecord = {
  id: string;
  leaseId: string;
  stickerNumber: string;
  status: 'ISSUED' | 'RETURNED' | 'DEACTIVATED';
  issuedAt: Date;
  returnedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  private accessCards: AccessCardRecord[] = [];
  private parkingStickers: ParkingStickerRecord[] = [];
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
      const lease: LeaseRecord = { ...data };
      this.leases.push(lease);
      return lease;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; orgId?: string };
    }) => {
      return (
        this.leases.find((lease) => {
          if (where.id && lease.id !== where.id) {
            return false;
          }
          if (where.orgId && lease.orgId !== where.orgId) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
  };

  leaseAccessCard = {
    findMany: async ({
      where,
    }: {
      where: { leaseId: string; cardNumber?: { in: string[] } };
      orderBy?: { createdAt?: 'desc' | 'asc' };
    }) => {
      let items = this.accessCards.filter(
        (card) => card.leaseId === where.leaseId,
      );
      if (where.cardNumber?.in) {
        items = items.filter((card) =>
          where.cardNumber?.in.includes(card.cardNumber),
        );
      }
      return items.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    },
    createMany: async ({
      data,
    }: {
      data: { leaseId: string; cardNumber: string }[];
    }) => {
      for (const item of data) {
        const now = new Date();
        const record: AccessCardRecord = {
          id: randomUUID(),
          leaseId: item.leaseId,
          cardNumber: item.cardNumber,
          status: 'ISSUED',
          issuedAt: now,
          returnedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        this.accessCards.push(record);
      }
      return { count: data.length };
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; leaseId: string };
    }) => {
      return (
        this.accessCards.find(
          (card) => card.id === where.id && card.leaseId === where.leaseId,
        ) ?? null
      );
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { status: AccessCardRecord['status']; returnedAt: Date | null };
    }) => {
      const card = this.accessCards.find((item) => item.id === where.id);
      if (!card) {
        throw new Error('Card not found');
      }
      card.status = data.status;
      card.returnedAt = data.returnedAt ?? null;
      card.updatedAt = new Date();
      return card;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.accessCards.findIndex((item) => item.id === where.id);
      if (index === -1) {
        throw new Error('Card not found');
      }
      const [removed] = this.accessCards.splice(index, 1);
      return removed;
    },
  };

  leaseParkingSticker = {
    findMany: async ({
      where,
    }: {
      where: { leaseId: string; stickerNumber?: { in: string[] } };
      orderBy?: { createdAt?: 'desc' | 'asc' };
    }) => {
      let items = this.parkingStickers.filter(
        (sticker) => sticker.leaseId === where.leaseId,
      );
      if (where.stickerNumber?.in) {
        items = items.filter((sticker) =>
          where.stickerNumber?.in.includes(sticker.stickerNumber),
        );
      }
      return items.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    },
    createMany: async ({
      data,
    }: {
      data: { leaseId: string; stickerNumber: string }[];
    }) => {
      for (const item of data) {
        const now = new Date();
        const record: ParkingStickerRecord = {
          id: randomUUID(),
          leaseId: item.leaseId,
          stickerNumber: item.stickerNumber,
          status: 'ISSUED',
          issuedAt: now,
          returnedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        this.parkingStickers.push(record);
      }
      return { count: data.length };
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; leaseId: string };
    }) => {
      return (
        this.parkingStickers.find(
          (sticker) =>
            sticker.id === where.id && sticker.leaseId === where.leaseId,
        ) ?? null
      );
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { status: ParkingStickerRecord['status']; returnedAt: Date | null };
    }) => {
      const sticker = this.parkingStickers.find((item) => item.id === where.id);
      if (!sticker) {
        throw new Error('Sticker not found');
      }
      sticker.status = data.status;
      sticker.returnedAt = data.returnedAt ?? null;
      sticker.updatedAt = new Date();
      return sticker;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.parkingStickers.findIndex(
        (item) => item.id === where.id,
      );
      if (index === -1) {
        throw new Error('Sticker not found');
      }
      const [removed] = this.parkingStickers.splice(index, 1);
      return removed;
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
    this.accessCards = [];
    this.parkingStickers = [];
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
      sub: user.id,
      email: user.email,
      orgId: user.orgId ?? null,
    };
    return true;
  }
}

describe('Lease access items (integration)', () => {
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
      controllers: [LeaseAccessCardsController, LeaseParkingStickersController],
      providers: [
        LeaseAccessCardsService,
        LeaseAccessCardsRepo,
        LeaseParkingStickersService,
        LeaseParkingStickersRepo,
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

  it('rejects reads without leases.access_items.read permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 when lease is outside org', async () => {
    permissionsByUser.set(userA.id, new Set(['leases.access_items.read']));

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseB.id}/access-cards`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(404);
  });

  it('creates, lists, updates, and deletes access cards', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.access_items.read', 'leases.access_items.write']),
    );

    const create = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ cardNumbers: ['A1', 'A2'] }),
      },
    );

    expect(create.status).toBe(200);
    const created = await create.json();
    expect(created).toHaveLength(2);

    const list = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      { headers: { 'x-user-id': userA.id } },
    );
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody).toHaveLength(2);

    const update = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards/${listBody[0].id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ status: 'RETURNED' }),
      },
    );
    expect(update.status).toBe(200);
    const updated = await update.json();
    expect(updated.status).toBe('RETURNED');
    expect(updated.returnedAt).not.toBeNull();

    const deleteResponse = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards/${listBody[1].id}`,
      { method: 'DELETE', headers: { 'x-user-id': userA.id } },
    );
    expect(deleteResponse.status).toBe(204);

    const afterDelete = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      { headers: { 'x-user-id': userA.id } },
    );
    const afterBody = await afterDelete.json();
    expect(afterBody).toHaveLength(1);
  });

  it('rejects access card writes without leases.access_items.write permission', async () => {
    permissionsByUser.set(userA.id, new Set(['leases.access_items.read']));

    const create = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ cardNumbers: ['A1'] }),
      },
    );

    expect(create.status).toBe(403);

    await prisma.leaseAccessCard.createMany({
      data: [{ leaseId: leaseA.id, cardNumber: 'A1' }],
    });
    const list = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      { headers: { 'x-user-id': userA.id } },
    );
    const listBody = await list.json();

    const update = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards/${listBody[0].id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ status: 'RETURNED' }),
      },
    );
    expect(update.status).toBe(403);

    const del = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards/${listBody[0].id}`,
      { method: 'DELETE', headers: { 'x-user-id': userA.id } },
    );
    expect(del.status).toBe(403);
  });

  it('returns 409 on duplicate access card numbers', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.access_items.read', 'leases.access_items.write']),
    );

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ cardNumbers: ['A1', 'A1'] }),
      },
    );

    expect(response.status).toBe(409);
  });

  it('prevents updating an access card from another lease', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.access_items.read', 'leases.access_items.write']),
    );

    const created = await prisma.leaseAccessCard.createMany({
      data: [{ leaseId: leaseA.id, cardNumber: 'A1' }],
    });
    expect(created.count).toBe(1);
    const list = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/access-cards`,
      { headers: { 'x-user-id': userA.id } },
    );
    const listBody = await list.json();

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseB.id}/access-cards/${listBody[0].id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ status: 'RETURNED' }),
      },
    );

    expect(response.status).toBe(404);
  });

  it('creates and manages parking stickers', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.access_items.read', 'leases.access_items.write']),
    );

    const create = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/parking-stickers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ stickerNumbers: ['S1'] }),
      },
    );

    expect(create.status).toBe(200);
    const created = await create.json();
    expect(created).toHaveLength(1);

    const update = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/parking-stickers/${created[0].id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ status: 'RETURNED' }),
      },
    );
    expect(update.status).toBe(200);
    const updated = await update.json();
    expect(updated.returnedAt).not.toBeNull();

    const deleteResponse = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/parking-stickers/${created[0].id}`,
      { method: 'DELETE', headers: { 'x-user-id': userA.id } },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it('returns 409 on duplicate parking sticker numbers', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.access_items.read', 'leases.access_items.write']),
    );

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/parking-stickers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({ stickerNumbers: ['S1', 'S1'] }),
      },
    );

    expect(response.status).toBe(409);
  });
});

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  OwnerAccessGrantStatus,
  PushPlatform,
  PushProvider,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { env } from '../src/config/env';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OwnerPortfolioGuard } from '../src/common/guards/owner-portfolio.guard';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { DeliveryTasksRepo } from '../src/infra/queue/delivery-tasks.repo';
import { QueueService } from '../src/infra/queue/queue.service';
import { OwnerPortfolioScopeService } from '../src/modules/owner-portfolio/owner-portfolio-scope.service';
import { OwnerNotificationsController } from '../src/modules/notifications/owner-notifications.controller';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PushDevicesRepo } from '../src/modules/notifications/push-devices.repo';
import { PushDeliveryReceiptsRepo } from '../src/modules/notifications/push-delivery-receipts.repo';
import { PushNotificationsService } from '../src/modules/notifications/push-notifications.service';

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
};

type OwnerRecord = {
  id: string;
  orgId: string;
  partyId: string | null;
  isActive: boolean;
};

type OwnerAccessGrantRecord = {
  id: string;
  userId: string | null;
  ownerId: string;
  status: OwnerAccessGrantStatus;
};

type PushDeviceRecord = {
  id: string;
  orgId: string | null;
  userId: string;
  provider: PushProvider;
  platform: PushPlatform;
  token: string;
  deviceId: string | null;
  appId: string | null;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type PushDeliveryReceiptRecord = {
  id: string;
  taskId: string;
  provider: PushProvider;
  platform: PushPlatform;
  userId: string | null;
  pushDeviceId: string | null;
  deviceTokenMasked: string | null;
  providerTicketId: string | null;
  providerReceiptId: string | null;
  status: 'PENDING' | 'DELIVERED' | 'ERROR';
  errorCode: string | null;
  errorMessage: string | null;
  details: Record<string, unknown> | null;
  checkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private users: UserRecord[] = [];
  private owners: OwnerRecord[] = [];
  private grants: OwnerAccessGrantRecord[] = [];
  private pushDevices: PushDeviceRecord[] = [];
  private pushDeliveryReceipts: PushDeliveryReceiptRecord[] = [];

  user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.users.find((user) => user.id === where.id) ?? null,
  };

  pushDevice = {
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { token: string };
      update: Partial<PushDeviceRecord>;
      create: Omit<PushDeviceRecord, 'id' | 'createdAt' | 'updatedAt'>;
    }) => {
      const existing = this.pushDevices.find(
        (device) => device.token === where.token,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return { ...existing };
      }

      const now = new Date();
      const created: PushDeviceRecord = {
        id: randomUUID(),
        ...create,
        createdAt: now,
        updatedAt: now,
      };
      this.pushDevices.push(created);
      return { ...created };
    },
    findFirst: async ({ where }: { where: { id?: string; userId?: string } }) =>
      this.pushDevices.find((device) => {
        if (where.id && device.id !== where.id) {
          return false;
        }
        if (where.userId && device.userId !== where.userId) {
          return false;
        }
        return true;
      }) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<PushDeviceRecord>;
    }) => {
      const existing = this.pushDevices.find(
        (device) => device.id === where.id,
      );
      if (!existing) {
        throw new Error('Push device not found');
      }
      Object.assign(existing, data, { updatedAt: new Date() });
      return { ...existing };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id?: string;
        userId?: string;
        token?: string | { in: string[] };
        orgId?: string | null;
      };
      data: Partial<PushDeviceRecord>;
    }) => {
      let count = 0;
      for (const device of this.pushDevices) {
        if (where.id && device.id !== where.id) {
          continue;
        }
        if (where.userId && device.userId !== where.userId) {
          continue;
        }
        if (where.orgId !== undefined && device.orgId !== where.orgId) {
          continue;
        }
        if (typeof where.token === 'string' && device.token !== where.token) {
          continue;
        }
        if (
          typeof where.token === 'object' &&
          !where.token.in.includes(device.token)
        ) {
          continue;
        }

        Object.assign(device, data, { updatedAt: new Date() });
        count += 1;
      }

      return { count };
    },
    findMany: async ({
      where,
    }: {
      where: {
        userId?: { in: string[] };
        isActive?: boolean;
        user?: {
          isActive?: boolean;
          OR?: Array<
            | { orgId?: string }
            | {
                ownerAccessGrants?: {
                  some: {
                    status: OwnerAccessGrantStatus;
                    owner: { orgId: string; isActive: boolean };
                  };
                };
              }
          >;
        };
      };
    }) => {
      const orgCondition = where.user?.OR?.find(
        (candidate): candidate is { orgId: string } =>
          'orgId' in candidate && typeof candidate.orgId === 'string',
      );
      const ownerGrantCondition = where.user?.OR?.find(
        (
          candidate,
        ): candidate is {
          ownerAccessGrants: {
            some: {
              status: OwnerAccessGrantStatus;
              owner: { orgId: string; isActive: boolean };
            };
          };
        } => 'ownerAccessGrants' in candidate,
      );

      return this.pushDevices
        .filter((device) => {
          if (where.userId?.in && !where.userId.in.includes(device.userId)) {
            return false;
          }
          if (
            where.isActive !== undefined &&
            device.isActive !== where.isActive
          ) {
            return false;
          }

          const user = this.users.find(
            (candidate) => candidate.id === device.userId,
          );
          if (!user) {
            return false;
          }
          if (
            where.user?.isActive !== undefined &&
            user.isActive !== where.user.isActive
          ) {
            return false;
          }

          const matchesOrgUser = Boolean(
            orgCondition?.orgId && user.orgId === orgCondition.orgId,
          );
          const matchesOwnerGrant = Boolean(
            ownerGrantCondition &&
            this.grants.some((grant) => {
              if (
                grant.userId !== user.id ||
                grant.status !==
                  ownerGrantCondition.ownerAccessGrants.some.status
              ) {
                return false;
              }

              const owner = this.owners.find(
                (candidate) => candidate.id === grant.ownerId,
              );
              if (!owner) {
                return false;
              }

              return (
                owner.orgId ===
                  ownerGrantCondition.ownerAccessGrants.some.owner.orgId &&
                owner.isActive ===
                  ownerGrantCondition.ownerAccessGrants.some.owner.isActive
              );
            }),
          );

          return matchesOrgUser || matchesOwnerGrant;
        })
        .map((device) => ({ ...device }));
    },
  };

  pushDeliveryReceipt = {
    createMany: async ({
      data,
    }: {
      data: Array<
        Omit<PushDeliveryReceiptRecord, 'id' | 'createdAt' | 'updatedAt'>
      >;
    }) => {
      const now = new Date();
      for (const item of data) {
        this.pushDeliveryReceipts.push({
          id: randomUUID(),
          ...item,
          createdAt: now,
          updatedAt: now,
        });
      }
      return { count: data.length };
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: {
        taskId?: string;
        provider?: PushProvider;
        status?: string;
        providerTicketId?: { not?: null };
        createdAt?: { lte?: Date };
      };
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
      take?: number;
    }) => {
      let rows = this.pushDeliveryReceipts.slice();
      if (where?.taskId) {
        rows = rows.filter((row) => row.taskId === where.taskId);
      }
      if (where?.provider) {
        rows = rows.filter((row) => row.provider === where.provider);
      }
      if (where?.status) {
        rows = rows.filter((row) => row.status === where.status);
      }
      if (where?.providerTicketId?.not === null) {
        rows = rows.filter((row) => row.providerTicketId !== null);
      }
      if (where?.createdAt?.lte) {
        rows = rows.filter((row) => row.createdAt <= where.createdAt!.lte!);
      }
      if (orderBy) {
        rows.sort((a, b) => {
          for (const clause of orderBy) {
            const [field, direction] = Object.entries(clause)[0];
            const av = a[field as keyof PushDeliveryReceiptRecord] as
              | Date
              | string
              | null;
            const bv = b[field as keyof PushDeliveryReceiptRecord] as
              | Date
              | string
              | null;
            const left = av instanceof Date ? av.getTime() : av ?? '';
            const right = bv instanceof Date ? bv.getTime() : bv ?? '';
            if (left === right) {
              continue;
            }
            return direction === 'asc'
              ? left < right
                ? -1
                : 1
              : left < right
                ? 1
                : -1;
          }
          return 0;
        });
      }
      return (take ? rows.slice(0, take) : rows).map((row) => ({ ...row }));
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        providerTicketId?: { in: string[] };
      };
      data: Partial<PushDeliveryReceiptRecord>;
    }) => {
      let count = 0;
      for (const row of this.pushDeliveryReceipts) {
        if (
          where.providerTicketId?.in &&
          !where.providerTicketId.in.includes(row.providerTicketId ?? '')
        ) {
          continue;
        }
        Object.assign(row, data, { updatedAt: new Date() });
        count += 1;
      }
      return { count };
    },
    update: async ({
      where,
      data,
    }: {
      where: { providerTicketId: string };
      data: Partial<PushDeliveryReceiptRecord>;
    }) => {
      const row = this.pushDeliveryReceipts.find(
        (item) => item.providerTicketId === where.providerTicketId,
      );
      if (!row) {
        throw new Error('Push delivery receipt not found');
      }
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  };

  reset() {
    this.users = [];
    this.owners = [];
    this.grants = [];
    this.pushDevices = [];
    this.pushDeliveryReceipts = [];
  }

  seedUser(input: { email: string; orgId: string | null; isActive?: boolean }) {
    const created: UserRecord = {
      id: randomUUID(),
      email: input.email,
      orgId: input.orgId,
      isActive: input.isActive ?? true,
    };
    this.users.push(created);
    return created;
  }

  seedOwner(input: {
    orgId: string;
    partyId?: string | null;
    isActive?: boolean;
  }) {
    const created: OwnerRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      partyId: input.partyId ?? null,
      isActive: input.isActive ?? true,
    };
    this.owners.push(created);
    return created;
  }

  seedGrant(input: {
    userId: string;
    ownerId: string;
    status?: OwnerAccessGrantStatus;
  }) {
    const created: OwnerAccessGrantRecord = {
      id: randomUUID(),
      userId: input.userId,
      ownerId: input.ownerId,
      status: input.status ?? OwnerAccessGrantStatus.ACTIVE,
    };
    this.grants.push(created);
    return created;
  }

  updateGrantStatus(grantId: string, status: OwnerAccessGrantStatus) {
    const grant = this.grants.find((item) => item.id === grantId);
    if (!grant) {
      throw new Error('Grant not found');
    }
    grant.status = status;
  }

  setOwnerActive(ownerId: string, isActive: boolean) {
    const owner = this.owners.find((item) => item.id === ownerId);
    if (!owner) {
      throw new Error('Owner not found');
    }
    owner.isActive = isActive;
  }

  hasActiveOwnerAccess(userId: string) {
    return this.grants.some((grant) => {
      if (
        grant.userId !== userId ||
        grant.status !== OwnerAccessGrantStatus.ACTIVE
      ) {
        return false;
      }

      const owner = this.owners.find(
        (candidate) => candidate.id === grant.ownerId,
      );
      return Boolean(owner?.isActive);
    });
  }

  listAccessibleOrgIds(userId: string) {
    return Array.from(
      new Set(
        this.grants
          .filter(
            (grant) =>
              grant.userId === userId &&
              grant.status === OwnerAccessGrantStatus.ACTIVE,
          )
          .map((grant) =>
            this.owners.find((owner) => owner.id === grant.ownerId),
          )
          .filter((owner): owner is OwnerRecord => Boolean(owner?.isActive))
          .map((owner) => owner.orgId),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  listPushDevices() {
    return this.pushDevices.map((device) => ({ ...device }));
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
      orgId: user.orgId,
    };
    return true;
  }
}

describe('Owner notification push devices (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let pushNotificationsService: PushNotificationsService;
  let ownerUser: UserRecord;
  let ownerGrant: OwnerAccessGrantRecord;
  let ownerA: OwnerRecord;
  let originalFetch: typeof fetch;
  let fetchMock: jest.Mock;
  let originalPushProvider: typeof env.PUSH_PROVIDER;

  const notificationsServiceMock = {
    listForUserAcrossOrgs: jest.fn(),
    countUnreadAcrossOrgs: jest.fn(),
    markReadAcrossOrgs: jest.fn(),
    markAllReadAcrossOrgs: jest.fn(),
    dismissAcrossOrgs: jest.fn(),
    undismissAcrossOrgs: jest.fn(),
  };

  const registerOwnerDevice = async (token: string) => {
    const response = await originalFetch(
      `${baseUrl}/owner/notifications/devices`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': ownerUser.id,
        },
        body: JSON.stringify({
          provider: PushProvider.EXPO,
          platform: PushPlatform.IOS,
          token,
          deviceId: 'owner-device',
        }),
      },
    );
    expect(response.status).toBe(201);
    return response.json();
  };

  const sendOwnerScopedPush = async (orgId: string) => {
    await pushNotificationsService.sendToUsers({
      orgId,
      userIds: [ownerUser.id],
      title: 'Owner notification',
      body: 'Body',
      data: { requestId: randomUUID() },
    });
  };

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();
    originalFetch = global.fetch;
    originalPushProvider = env.PUSH_PROVIDER;

    const moduleRef = await Test.createTestingModule({
      controllers: [OwnerNotificationsController],
      providers: [
        OwnerPortfolioGuard,
        PushDevicesRepo,
        PushDeliveryReceiptsRepo,
        PushNotificationsService,
        DeliveryTasksRepo,
        {
          provide: QueueService,
          useValue: {
            enqueue: async () => false,
            createWorker: () => null,
            closeWorker: async () => undefined,
          },
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
        {
          provide: OwnerPortfolioScopeService,
          useValue: {
            hasActiveOwnerAccess: async (userId: string) =>
              prisma.hasActiveOwnerAccess(userId),
            listAccessibleOrgIds: async (userId: string) =>
              prisma.listAccessibleOrgIds(userId),
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
    pushNotificationsService = moduleRef.get(PushNotificationsService);
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    env.PUSH_PROVIDER = originalPushProvider;
    await app.close();
  });

  beforeEach(() => {
    prisma.reset();
    jest.clearAllMocks();

    env.PUSH_PROVIDER = 'expo';
    ownerUser = prisma.seedUser({
      email: 'owner@test.com',
      orgId: null,
    });
    ownerA = prisma.seedOwner({
      orgId: 'org-a',
      isActive: true,
    });
    ownerGrant = prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
    });

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ status: 'ok', id: 'ticket-1' }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('registers an owner push device without org context', async () => {
    const body = await registerOwnerDevice('ExponentPushToken[owner-register]');

    expect(body).toMatchObject({
      provider: PushProvider.EXPO,
      platform: PushPlatform.IOS,
      token: 'ExponentPushToken[owner-register]',
      deviceId: 'owner-device',
      isActive: true,
    });

    expect(prisma.listPushDevices()).toEqual([
      expect.objectContaining({
        id: body.id,
        userId: ownerUser.id,
        orgId: null,
        token: 'ExponentPushToken[owner-register]',
      }),
    ]);
  });

  it('updates an owner push device token by device id', async () => {
    const created = await registerOwnerDevice('ExponentPushToken[owner-old]');

    const response = await originalFetch(
      `${baseUrl}/owner/notifications/devices/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': ownerUser.id,
        },
        body: JSON.stringify({
          token: 'ExponentPushToken[owner-new]',
          deviceId: 'owner-device-updated',
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: created.id,
      token: 'ExponentPushToken[owner-new]',
      deviceId: 'owner-device-updated',
    });

    expect(prisma.listPushDevices()).toEqual([
      expect.objectContaining({
        id: created.id,
        orgId: null,
        token: 'ExponentPushToken[owner-new]',
        deviceId: 'owner-device-updated',
      }),
    ]);
  });

  it('returns unread count across the owner accessible org scope', async () => {
    prisma.seedOwner({
      orgId: 'org-b',
      isActive: true,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: prisma.seedOwner({
        orgId: 'org-c',
        isActive: true,
      }).id,
    });
    notificationsServiceMock.countUnreadAcrossOrgs.mockResolvedValue(3);

    const response = await originalFetch(
      `${baseUrl}/owner/notifications/unread-count`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ unreadCount: 3 });
    expect(notificationsServiceMock.countUnreadAcrossOrgs).toHaveBeenCalledWith(
      ownerUser.id,
      ['org-a', 'org-c'],
    );
  });

  it('delivers push for an accessible owner org scope', async () => {
    await registerOwnerDevice('ExponentPushToken[owner-accessible]');

    await sendOwnerScopedPush('org-a');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[owner-accessible]',
        title: 'Owner notification',
      }),
    ]);
  });

  it('stops future push targeting when the owner grant is disabled', async () => {
    await registerOwnerDevice('ExponentPushToken[owner-disabled]');
    prisma.updateGrantStatus(ownerGrant.id, OwnerAccessGrantStatus.DISABLED);

    await sendOwnerScopedPush('org-a');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops future push targeting when the owner is inactive', async () => {
    await registerOwnerDevice('ExponentPushToken[owner-inactive]');
    prisma.setOwnerActive(ownerA.id, false);

    await sendOwnerScopedPush('org-a');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not deliver push for the same party in another org without a grant', async () => {
    const sharedPartyId = randomUUID();
    prisma.reset();
    ownerUser = prisma.seedUser({
      email: 'owner@test.com',
      orgId: null,
    });
    ownerA = prisma.seedOwner({
      orgId: 'org-a',
      partyId: sharedPartyId,
      isActive: true,
    });
    ownerGrant = prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
    });
    prisma.seedOwner({
      orgId: 'org-b',
      partyId: sharedPartyId,
      isActive: true,
    });

    await registerOwnerDevice('ExponentPushToken[owner-cross-org]');

    await sendOwnerScopedPush('org-b');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops delivery after removing the device', async () => {
    const created = await registerOwnerDevice(
      'ExponentPushToken[owner-delete]',
    );

    const removeResponse = await originalFetch(
      `${baseUrl}/owner/notifications/devices/${created.id}`,
      {
        method: 'DELETE',
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(removeResponse.status).toBe(200);

    await sendOwnerScopedPush('org-a');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { io, Socket } from 'socket.io-client';
import { NotificationsGateway } from '../src/modules/notifications/notifications.gateway';
import { NotificationsRepo } from '../src/modules/notifications/notifications.repo';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationsRealtimeService } from '../src/modules/notifications/notifications-realtime.service';
import { NotificationTypeEnum } from '../src/modules/notifications/notifications.constants';
import { PushNotificationsService } from '../src/modules/notifications/push-notifications.service';
import { OwnerPortfolioScopeService } from '../src/modules/owner-portfolio/owner-portfolio-scope.service';
import { AuthRepo } from '../src/modules/auth/auth.repo';
import { AuthValidationService } from '../src/modules/auth/auth-validation.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type UserRecord = {
  id: string;
  email: string;
  orgId?: string | null;
  isActive: boolean;
};

type NotificationRecord = {
  id: string;
  orgId: string;
  recipientUserId: string;
  type: NotificationTypeEnum;
  title: string;
  body?: string | null;
  data: Record<string, unknown>;
  readAt?: Date | null;
  createdAt: Date;
};

class InMemoryPrismaService {
  private users: UserRecord[] = [];
  private notifications: NotificationRecord[] = [];

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((user) => user.id === where.id) ?? null;
    },
    create: async ({
      data,
    }: {
      data: { email: string; orgId: string | null; isActive?: boolean };
    }) => {
      const record: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        isActive: data.isActive ?? true,
      };
      this.users.push(record);
      return record;
    },
  };

  userRole = {
    findMany: async () => {
      return [];
    },
  };

  notification = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        recipientUserId: string;
        type: NotificationTypeEnum;
        title: string;
        body?: string | null;
        data: Record<string, unknown>;
      };
    }) => {
      const record: NotificationRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        recipientUserId: data.recipientUserId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        data: data.data,
        readAt: null,
        createdAt: new Date(),
      };
      this.notifications.push(record);
      return record;
    },
    count: async ({
      where,
    }: {
      where: { recipientUserId: string; orgId: string; readAt?: null };
    }) => {
      return this.notifications.filter((notification) => {
        if (notification.recipientUserId !== where.recipientUserId) {
          return false;
        }
        if (notification.orgId !== where.orgId) {
          return false;
        }
        if (where.readAt === null && notification.readAt !== null) {
          return false;
        }
        return true;
      }).length;
    },
  };

  reset() {
    this.users = [];
    this.notifications = [];
  }
}

const waitForEvent = <T>(socket: Socket, event: string, timeoutMs = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const waitForConnect = (socket: Socket, timeoutMs = 3000) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('socket connect timeout')),
      timeoutMs,
    );
    const onError = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.off('connect_error', onError);
      resolve();
    });
    socket.once('connect_error', onError);
  });

describe('Notifications realtime (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwtService: JwtService;
  let prisma: InMemoryPrismaService;
  let notificationsService: NotificationsService;
  let ownerPortfolioScopeService: {
    listAccessibleOrgIds: jest.Mock;
  };

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();
    jwtService = new JwtService();
    ownerPortfolioScopeService = {
      listAccessibleOrgIds: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        NotificationsRepo,
        NotificationsService,
        NotificationsRealtimeService,
        AuthRepo,
        AuthValidationService,
        {
          provide: PushNotificationsService,
          useValue: {
            sendToUsers: async () => undefined,
          },
        },
        {
          provide: OwnerPortfolioScopeService,
          useValue: ownerPortfolioScopeService,
        },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
    notificationsService = moduleRef.get(NotificationsService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    prisma.reset();
    ownerPortfolioScopeService.listAccessibleOrgIds.mockReset();
  });

  it('delivers notifications to the correct user only', async () => {
    const orgAId = randomUUID();
    const orgBId = randomUUID();
    const userA = await prisma.user.create({
      data: { email: 'user-a@org.test', orgId: orgAId, isActive: true },
    });
    const userB = await prisma.user.create({
      data: { email: 'user-b@org.test', orgId: orgBId, isActive: true },
    });

    const tokenA = await jwtService.signAsync(
      { sub: userA.id, email: userA.email, orgId: userA.orgId },
      { secret: process.env.JWT_ACCESS_SECRET },
    );

    const socket = io(`${baseUrl}/notifications`, {
      transports: ['websocket'],
      auth: { token: tokenA },
      autoConnect: false,
    });

    const helloPromise = waitForEvent<{ unreadCount: number }>(
      socket,
      'notifications:hello',
      5000,
    );
    socket.connect();
    await waitForConnect(socket);
    const hello = await helloPromise;
    expect(hello.unreadCount).toBe(0);

    const incoming = waitForEvent<any>(socket, 'notifications:new');
    await notificationsService.createForUsers({
      orgId: orgAId,
      userIds: [userA.id],
      type: NotificationTypeEnum.REQUEST_CREATED,
      title: 'Test A',
      data: { test: true },
    });
    const payload = await incoming;
    expect(payload.title).toBe('Test A');
    expect(payload.type).toBe(NotificationTypeEnum.REQUEST_CREATED);

    const noOther = new Promise<boolean>((resolve) => {
      const handler = () => {
        clearTimeout(timer);
        resolve(false);
      };
      const timer = setTimeout(() => {
        socket.off('notifications:new', handler);
        resolve(true);
      }, 300);
      socket.once('notifications:new', handler);
    });

    await notificationsService.createForUsers({
      orgId: orgBId,
      userIds: [userB.id],
      type: NotificationTypeEnum.REQUEST_ASSIGNED,
      title: 'Test B',
      data: { test: false },
    });

    expect(await noOther).toBe(true);
    socket.disconnect();
  });

  it('lets an owner session without orgId join all accessible org rooms', async () => {
    const orgAId = randomUUID();
    const orgBId = randomUUID();
    const ownerUser = await prisma.user.create({
      data: { email: 'owner@test.com', orgId: null, isActive: true },
    });
    ownerPortfolioScopeService.listAccessibleOrgIds.mockResolvedValue([
      orgAId,
      orgBId,
    ]);

    const ownerToken = await jwtService.signAsync(
      { sub: ownerUser.id, email: ownerUser.email, orgId: null },
      { secret: process.env.JWT_ACCESS_SECRET },
    );

    const socket = io(`${baseUrl}/notifications`, {
      transports: ['websocket'],
      auth: { token: ownerToken },
      autoConnect: false,
    });

    const helloPromise = waitForEvent<{ unreadCount: number }>(
      socket,
      'notifications:hello',
      5000,
    );
    socket.connect();
    await waitForConnect(socket);
    const hello = await helloPromise;
    expect(hello.unreadCount).toBe(0);

    const incoming = waitForEvent<any>(socket, 'notifications:new');
    await notificationsService.createForUsers({
      orgId: orgBId,
      userIds: [ownerUser.id],
      type: NotificationTypeEnum.OWNER_APPROVAL_REQUESTED,
      title: 'Owner approval requested',
      data: { requestId: 'request-1' },
    });

    const payload = await incoming;
    expect(payload.type).toBe(NotificationTypeEnum.OWNER_APPROVAL_REQUESTED);
    expect(
      ownerPortfolioScopeService.listAccessibleOrgIds,
    ).toHaveBeenCalledWith(ownerUser.id);

    socket.disconnect();
  });
});

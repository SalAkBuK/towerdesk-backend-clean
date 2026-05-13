import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DeliveryTaskKind } from '@prisma/client';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { env } from '../src/config/env';
import { PlatformAuthGuard } from '../src/common/guards/platform-auth.guard';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { AuthPasswordDeliveryService } from '../src/modules/auth/auth-password-delivery.service';
import { BroadcastDeliveryService } from '../src/modules/broadcasts/broadcast-delivery.service';
import { PushNotificationsService } from '../src/modules/notifications/push-notifications.service';
import { PushDeliveryReceiptsRepo } from '../src/modules/notifications/push-delivery-receipts.repo';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { DeliveryTaskRetentionService } from '../src/infra/queue/delivery-task-retention.service';
import { DeliveryTasksRepo } from '../src/infra/queue/delivery-tasks.repo';
import { PlatformDeliveryTasksController } from '../src/modules/platform/platform-delivery-tasks.controller';
import { PlatformDeliveryTasksService } from '../src/modules/platform/platform-delivery-tasks.service';

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
};

describe('Platform delivery tasks (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let repo: DeliveryTasksRepo;
  let authPasswordDeliveryService: jest.Mocked<AuthPasswordDeliveryService>;
  let deliveryTaskRetentionService: jest.Mocked<DeliveryTaskRetentionService>;
  let pushDeliveryReceiptsRepo: jest.Mocked<PushDeliveryReceiptsRepo>;
  let jwtService: jest.Mocked<JwtService>;
  let platformUser: UserRecord;
  let originalPlatformApiKey: string | undefined;
  const platformKey = 'test-platform-key';
  const users = new Map<string, UserRecord>();
  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    originalPlatformApiKey = env.PLATFORM_API_KEY;
    jwtService = {
      verifyAsync: jest.fn(),
    } as never;

    authPasswordDeliveryService = {
      retryTask: jest.fn(),
    } as never;

    deliveryTaskRetentionService = {
      pruneExpiredTasks: jest.fn(),
    } as never;

    pushDeliveryReceiptsRepo = {
      summarizeByTaskIds: jest.fn().mockResolvedValue(new Map()),
      listByTaskId: jest.fn().mockResolvedValue([]),
    } as never;

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformDeliveryTasksController],
      providers: [
        PlatformDeliveryTasksService,
        PlatformAuthGuard,
        Reflector,
        DeliveryTasksRepo,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async ({ where }: { where: { id: string } }) =>
                users.get(where.id) ?? null,
            },
          },
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (userId: string) =>
              permissionsByUser.get(userId) ?? new Set<string>(),
          },
        },
        {
          provide: AuthPasswordDeliveryService,
          useValue: authPasswordDeliveryService,
        },
        {
          provide: PushNotificationsService,
          useValue: {
            retryTask: jest.fn(),
          },
        },
        {
          provide: PushDeliveryReceiptsRepo,
          useValue: pushDeliveryReceiptsRepo,
        },
        {
          provide: BroadcastDeliveryService,
          useValue: {
            retryTask: jest.fn(),
          },
        },
        {
          provide: DeliveryTaskRetentionService,
          useValue: deliveryTaskRetentionService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
    repo = moduleRef.get(DeliveryTasksRepo);
  });

  afterAll(async () => {
    env.PLATFORM_API_KEY = originalPlatformApiKey;
    await app.close();
  });

  beforeEach(() => {
    users.clear();
    permissionsByUser.clear();
    jest.clearAllMocks();
    platformUser = {
      id: 'platform-user-1',
      email: 'platform@test.local',
      orgId: null,
      isActive: true,
    };
    users.set(platformUser.id, platformUser);
    permissionsByUser.set(
      platformUser.id,
      new Set(['platform.delivery_tasks.read', 'platform.delivery_tasks.retry']),
    );
    env.PLATFORM_API_KEY = platformKey;
    jwtService.verifyAsync.mockResolvedValue({
      sub: platformUser.id,
      email: platformUser.email,
      orgId: null,
    } as never);
  });

  it('lists delivery tasks with pagination and redacted payload summaries via platform key', async () => {
    await repo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'hash-1',
      payload: {
        email: 'user-1@example.com',
        token: 'secret-token-1',
        expiresAt: '2026-04-13T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await repo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-2',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'hash-2',
      payload: {
        email: 'user-2@example.com',
        token: 'secret-token-2',
        expiresAt: '2026-04-14T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });

    const firstPageResponse = await fetch(
      `${baseUrl}/platform/delivery-tasks?limit=1`,
      {
        headers: { 'x-platform-key': platformKey },
      },
    );

    expect(firstPageResponse.status).toBe(200);
    const firstPageBody = await firstPageResponse.json();
    expect(firstPageBody.items).toHaveLength(1);
    expect(firstPageBody.items[0].payloadSummary).toEqual(
      expect.objectContaining({
        email: 'user-2@example.com',
        purpose: 'PASSWORD_RESET',
      }),
    );
    expect(firstPageBody.items[0].payloadSummary).not.toHaveProperty('token');
    expect(firstPageBody.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await fetch(
      `${baseUrl}/platform/delivery-tasks?limit=1&cursor=${encodeURIComponent(firstPageBody.nextCursor)}`,
      {
        headers: { 'x-platform-key': platformKey },
      },
    );

    expect(secondPageResponse.status).toBe(200);
    const secondPageBody = await secondPageResponse.json();
    expect(secondPageBody.items).toHaveLength(1);
    expect(secondPageBody.items[0].payloadSummary).toEqual(
      expect.objectContaining({
        email: 'user-1@example.com',
      }),
    );
    expect(secondPageBody.items[0].payloadSummary).not.toHaveProperty('token');
    expect(secondPageBody.nextCursor).toBeUndefined();
  });

  it('returns task detail with redacted payload summary', async () => {
    const task = await repo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'hash-1',
      payload: {
        email: 'user@example.com',
        token: 'secret-token',
        expiresAt: '2026-04-13T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });

    const response = await fetch(`${baseUrl}/platform/delivery-tasks/${task.id}`, {
      headers: { 'x-platform-key': platformKey },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.payloadSummary).toEqual(
      expect.objectContaining({
        email: 'user@example.com',
        purpose: 'PASSWORD_RESET',
      }),
    );
    expect(body.payloadSummary).not.toHaveProperty('token');
  });

  it('retries a failed task and marks the source task retried', async () => {
    const failedTask = await repo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'hash-1',
      payload: {
        email: 'user@example.com',
        token: 'secret-token',
        expiresAt: '2026-04-13T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });
    await repo.markFailed(failedTask.id, 'smtp timeout');

    const replacementTask = await repo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'hash-2',
      payload: {
        email: 'user@example.com',
        token: 'replacement-token',
        expiresAt: '2026-04-14T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });
    authPasswordDeliveryService.retryTask.mockResolvedValue(
      replacementTask as never,
    );

    const response = await fetch(
      `${baseUrl}/platform/delivery-tasks/${failedTask.id}/retry`,
      {
        method: 'POST',
        headers: { 'x-platform-key': platformKey },
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.sourceTaskId).toBe(failedTask.id);
    expect(body.task.id).toBe(replacementTask.id);

    const sourceTask = await repo.findById(failedTask.id);
    expect(sourceTask?.status).toBe('RETRIED');
    expect(sourceTask?.replacedByTaskId).toBe(replacementTask.id);
  });

  it('rejects bearer-authenticated platform users without the required permission', async () => {
    permissionsByUser.set(platformUser.id, new Set());

    const response = await fetch(`${baseUrl}/platform/delivery-tasks`, {
      headers: { Authorization: 'Bearer platform-token' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Missing required permissions',
    });
  });
});

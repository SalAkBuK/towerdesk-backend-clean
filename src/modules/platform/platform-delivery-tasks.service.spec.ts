import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryTaskKind, DeliveryTaskStatus } from '@prisma/client';
import { DeliveryTaskRetentionService } from '../../infra/queue/delivery-task-retention.service';
import { DeliveryTasksRepo } from '../../infra/queue/delivery-tasks.repo';
import { AuthPasswordDeliveryService } from '../auth/auth-password-delivery.service';
import { BroadcastDeliveryService } from '../broadcasts/broadcast-delivery.service';
import { PushDeliveryReceiptsRepo } from '../notifications/push-delivery-receipts.repo';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { PlatformDeliveryTasksService } from './platform-delivery-tasks.service';

describe('PlatformDeliveryTasksService', () => {
  let repo: DeliveryTasksRepo;
  let deliveryTaskRetentionService: jest.Mocked<DeliveryTaskRetentionService>;
  let authPasswordDeliveryService: jest.Mocked<AuthPasswordDeliveryService>;
  let pushNotificationsService: jest.Mocked<PushNotificationsService>;
  let pushDeliveryReceiptsRepo: jest.Mocked<PushDeliveryReceiptsRepo>;
  let broadcastDeliveryService: jest.Mocked<BroadcastDeliveryService>;
  let service: PlatformDeliveryTasksService;

  beforeEach(() => {
    repo = new DeliveryTasksRepo({} as never);
    deliveryTaskRetentionService = {
      pruneExpiredTasks: jest.fn(),
    } as never;
    authPasswordDeliveryService = {
      retryTask: jest.fn(),
    } as unknown as jest.Mocked<AuthPasswordDeliveryService>;
    pushNotificationsService = {
      retryTask: jest.fn(),
    } as unknown as jest.Mocked<PushNotificationsService>;
    pushDeliveryReceiptsRepo = {
      summarizeByTaskIds: jest.fn().mockResolvedValue(new Map()),
      listByTaskId: jest.fn().mockResolvedValue([]),
    } as never;
    broadcastDeliveryService = {
      retryTask: jest.fn(),
    } as unknown as jest.Mocked<BroadcastDeliveryService>;

    service = new PlatformDeliveryTasksService(
      repo,
      deliveryTaskRetentionService,
      authPasswordDeliveryService,
      pushNotificationsService,
      pushDeliveryReceiptsRepo,
      broadcastDeliveryService,
    );
  });

  it('lists delivery tasks with sanitized payload summaries', async () => {
    await repo.create({
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

    const result = await service.list({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].payloadSummary).toEqual({
      email: 'user@example.com',
      purpose: 'PASSWORD_RESET',
      expiresAt: '2026-04-13T00:00:00.000Z',
      inviteeName: null,
      inviterName: null,
    });
    expect(result.items[0].payloadSummary).not.toHaveProperty('token');
  });

  it('retries failed auth email tasks through the auth delivery service', async () => {
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
    await repo.markFailed(task.id, 'smtp timeout');

    const retriedTask = await repo.create({
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
    authPasswordDeliveryService.retryTask.mockResolvedValue(
      retriedTask as never,
    );

    const result = await service.retry(task.id);

    expect(authPasswordDeliveryService.retryTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: task.id,
        kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      }),
    );
    expect(result.sourceTaskId).toBe(task.id);
    expect(result.task.id).toBe(retriedTask.id);

    const sourceTask = await repo.findById(task.id);
    expect(sourceTask?.status).toBe(DeliveryTaskStatus.RETRIED);
    expect(sourceTask?.replacedByTaskId).toBe(retriedTask.id);
    expect(sourceTask?.retriedAt).toBeInstanceOf(Date);
  });

  it('blocks retrying the same failed task twice', async () => {
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
    await repo.markFailed(task.id, 'smtp timeout');

    const retriedTask = await repo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'hash-2',
      payload: {
        email: 'user@example.com',
        token: 'secret-token-2',
        expiresAt: '2026-04-14T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });
    authPasswordDeliveryService.retryTask.mockResolvedValue(
      retriedTask as never,
    );

    await service.retry(task.id);

    await expect(service.retry(task.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(authPasswordDeliveryService.retryTask).toHaveBeenCalledTimes(1);
  });

  it('releases the retry claim if replacement task creation fails', async () => {
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
    await repo.markFailed(task.id, 'smtp timeout');
    authPasswordDeliveryService.retryTask.mockRejectedValue(
      new NotFoundException('User not found'),
    );

    await expect(service.retry(task.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const sourceTask = await repo.findById(task.id);
    expect(sourceTask?.status).toBe(DeliveryTaskStatus.FAILED);
    expect(sourceTask?.replacedByTaskId).toBeNull();
    expect(sourceTask?.retriedAt).toBeNull();
  });

  it('returns delivery task summary data for failed tasks', async () => {
    const failed = await repo.create({
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
    await repo.markFailed(failed.id, 'smtp timeout');
    await repo.create({
      kind: DeliveryTaskKind.PUSH_NOTIFICATION,
      queueName: 'push-deliveries',
      jobName: 'notifications.push',
      orgId: 'org-1',
      payload: {
        orgId: 'org-1',
        userIds: ['user-1'],
        title: 'Hello',
      },
    });

    const summary = await service.summary({});

    expect(summary.total).toBe(2);
    expect(summary.failedCount).toBe(1);
    expect(summary.byStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: DeliveryTaskStatus.FAILED,
          count: 1,
        }),
      ]),
    );
    expect(summary.topErrors).toEqual([
      expect.objectContaining({
        kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
        lastError: 'smtp timeout',
        count: 1,
      }),
    ]);
  });

  it('delegates cleanup to the retention service with terminal statuses', async () => {
    deliveryTaskRetentionService.pruneExpiredTasks.mockResolvedValue({
      count: 4,
      olderThan: new Date('2026-03-01T00:00:00.000Z'),
      olderThanDays: 30,
      statuses: [DeliveryTaskStatus.FAILED, DeliveryTaskStatus.RETRIED],
      dryRun: true,
    } as never);

    const result = await service.cleanup({
      olderThanDays: 30,
      statuses: [DeliveryTaskStatus.FAILED, DeliveryTaskStatus.RETRIED],
      dryRun: true,
    });

    expect(deliveryTaskRetentionService.pruneExpiredTasks).toHaveBeenCalledWith(
      {
        olderThanDays: 30,
        statuses: [DeliveryTaskStatus.FAILED, DeliveryTaskStatus.RETRIED],
        dryRun: true,
      },
    );
    expect(result.count).toBe(4);
  });
});

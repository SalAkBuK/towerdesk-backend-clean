import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryTaskKind } from '@prisma/client';
import { env } from '../../config/env';
import { DeliveryTasksRepo } from '../../infra/queue/delivery-tasks.repo';
import { PasswordEmailDeliveryPayload } from '../../infra/queue/delivery-task.types';
import { QueueService } from '../../infra/queue/queue.service';
import { EmailService } from '../../infra/email/email.service';
import { AuthRepo } from './auth.repo';
import { AuthPasswordDeliveryService } from './auth-password-delivery.service';

describe('AuthPasswordDeliveryService', () => {
  let authRepo: jest.Mocked<AuthRepo>;
  let emailService: jest.Mocked<EmailService>;
  let deliveryTasksRepo: DeliveryTasksRepo;
  let queueService: jest.Mocked<QueueService>;
  let service: AuthPasswordDeliveryService;

  beforeEach(() => {
    authRepo = {
      findById: jest.fn(),
      createPasswordResetToken: jest.fn(),
      createResidentInvite: jest.fn(),
      markResidentInviteFailed: jest.fn(),
    } as unknown as jest.Mocked<AuthRepo>;
    emailService = {
      send: jest.fn(),
    } as unknown as jest.Mocked<EmailService>;
    deliveryTasksRepo = new DeliveryTasksRepo({} as never);
    queueService = {
      enqueue: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<QueueService>;

    service = new AuthPasswordDeliveryService(
      authRepo,
      emailService,
      deliveryTasksRepo,
      queueService,
    );
  });

  it('reissues a fresh token when retrying a failed auth delivery task', async () => {
    const task = await deliveryTasksRepo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'old-hash',
      payload: {
        email: 'user@example.com',
        token: 'old-token',
        expiresAt: '2026-04-13T00:00:00.000Z',
        purpose: 'RESIDENT_INVITE',
        issuedByUserId: 'admin-1',
        context: {
          inviteeName: 'Resident User',
          inviterName: 'Org Admin',
        },
        residentInviteTokenHash: 'old-hash',
      },
    });
    await deliveryTasksRepo.markFailed(task.id, 'smtp timeout');
    authRepo.findById.mockResolvedValue({
      id: 'user-1',
      email: 'fresh@example.com',
      isActive: true,
      name: 'Resident User',
    } as never);

    const retried = await service.retryTask(task);
    const retriedPayload = retried.payload as PasswordEmailDeliveryPayload;

    expect(authRepo.createPasswordResetToken).toHaveBeenCalledTimes(1);
    const [userId, tokenHash, expiresAt] =
      authRepo.createPasswordResetToken.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt).toBeInstanceOf(Date);
    expect(authRepo.createPasswordResetToken.mock.calls[0][3]).toBe(
      'RESIDENT_INVITE',
    );
    expect(authRepo.createResidentInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        createdByUserId: 'admin-1',
        email: 'fresh@example.com',
        tokenHash,
        expiresAt,
      }),
    );
    expect(retried.referenceId).toBe(tokenHash);
    expect(retriedPayload.email).toBe('fresh@example.com');
    expect(retriedPayload.token).not.toBe('old-token');
    expect(retriedPayload.expiresAt).toBe(expiresAt.toISOString());
    expect(retriedPayload.residentInviteTokenHash).toBe(tokenHash);
    expect(retriedPayload.issuedByUserId).toBe('admin-1');
    expect(queueService.enqueue).toHaveBeenCalledWith(
      'auth-deliveries',
      'auth.password-email',
      { taskId: retried.id },
      expect.objectContaining({
        jobId: retried.id,
        attempts: task.maxAttempts,
      }),
    );
  });

  it('rejects auth delivery retry when the linked user no longer exists', async () => {
    const task = await deliveryTasksRepo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'old-hash',
      payload: {
        email: 'user@example.com',
        token: 'old-token',
        expiresAt: '2026-04-13T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });
    authRepo.findById.mockResolvedValue(null);

    await expect(service.retryTask(task)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects auth delivery retry for inactive users', async () => {
    const task = await deliveryTasksRepo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'old-hash',
      payload: {
        email: 'user@example.com',
        token: 'old-token',
        expiresAt: '2026-04-13T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });
    authRepo.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: false,
    } as never);

    await expect(service.retryTask(task)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('uses the configured reset TTL for retried auth delivery tasks', async () => {
    const originalTtl = env.AUTH_PASSWORD_RESET_TTL_MINUTES;
    env.AUTH_PASSWORD_RESET_TTL_MINUTES = 45;

    const task = await deliveryTasksRepo.create({
      kind: DeliveryTaskKind.AUTH_PASSWORD_EMAIL,
      queueName: 'auth-deliveries',
      jobName: 'auth.password-email',
      orgId: 'org-1',
      userId: 'user-1',
      referenceType: 'PASSWORD_RESET_TOKEN',
      referenceId: 'old-hash',
      payload: {
        email: 'user@example.com',
        token: 'old-token',
        expiresAt: '2026-04-13T00:00:00.000Z',
        purpose: 'PASSWORD_RESET',
      },
    });
    authRepo.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
    } as never);

    const before = Date.now();
    await service.retryTask(task);
    const [, , expiresAt] = authRepo.createPasswordResetToken.mock.calls[0];
    const ttlMs = expiresAt.getTime() - before;

    expect(authRepo.createPasswordResetToken.mock.calls[0][3]).toBe(
      'PASSWORD_RESET',
    );
    expect(ttlMs).toBeGreaterThanOrEqual(44 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(46 * 60 * 1000);

    env.AUTH_PASSWORD_RESET_TTL_MINUTES = originalTtl;
  });

  it('sends password reset links with explicit reset mode', async () => {
    const originalTemplate = env.AUTH_PASSWORD_RESET_URL_TEMPLATE;
    env.AUTH_PASSWORD_RESET_URL_TEMPLATE =
      'https://portal.towerdesk.test/reset-password';
    queueService.enqueue.mockResolvedValue(false);

    await service.enqueuePasswordResetEmail({
      email: 'user@example.com',
      token: 'reset-token',
      tokenHash: 'reset-hash',
      expiresAt: new Date('2026-04-13T00:00:00.000Z'),
      purpose: 'PASSWORD_RESET',
      userId: 'user-1',
    });

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Reset your Towerdesk password',
        text: expect.stringContaining(
          'https://portal.towerdesk.test/reset-password?token=reset-token&mode=reset',
        ),
        html: expect.stringContaining(
          'https://portal.towerdesk.test/reset-password?token=reset-token&mode=reset',
        ),
      }),
    );

    env.AUTH_PASSWORD_RESET_URL_TEMPLATE = originalTemplate;
  });

  it('sends invite links with invite mode', async () => {
    const originalTemplate = env.AUTH_PASSWORD_RESET_URL_TEMPLATE;
    env.AUTH_PASSWORD_RESET_URL_TEMPLATE =
      'https://portal.towerdesk.test/reset-password';
    queueService.enqueue.mockResolvedValue(false);

    await service.enqueuePasswordResetEmail({
      email: 'owner@example.com',
      token: 'invite-token',
      tokenHash: 'invite-hash',
      expiresAt: new Date('2026-04-13T00:00:00.000Z'),
      purpose: 'OWNER_INVITE',
      userId: 'user-1',
    });

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "You're invited to Towerdesk - set your password",
        text: expect.stringContaining(
          'https://portal.towerdesk.test/reset-password?token=invite-token&mode=invite',
        ),
        html: expect.stringContaining(
          'https://portal.towerdesk.test/reset-password?token=invite-token&mode=invite',
        ),
      }),
    );

    env.AUTH_PASSWORD_RESET_URL_TEMPLATE = originalTemplate;
  });
});

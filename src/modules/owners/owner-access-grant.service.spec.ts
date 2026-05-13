import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  OwnerAccessGrantAuditAction,
  OwnerAccessGrantStatus,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { OwnerAccessGrantService } from './owner-access-grant.service';

describe('OwnerAccessGrantService', () => {
  let prisma: {
    owner: { findFirst: jest.Mock };
    ownerAccessGrant: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    ownerAccessGrantAudit: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    user: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  };
  let notificationsService: {
    createForUsers: jest.Mock;
  };
  let authService: {
    requestPasswordReset: jest.Mock;
  };
  let service: OwnerAccessGrantService;

  beforeEach(() => {
    prisma = {
      owner: {
        findFirst: jest.fn(),
      },
      ownerAccessGrant: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      ownerAccessGrantAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    notificationsService = {
      createForUsers: jest.fn().mockResolvedValue([]),
    };
    authService = {
      requestPasswordReset: jest.fn().mockResolvedValue({ success: true }),
    };
    service = new OwnerAccessGrantService(
      prisma as unknown as PrismaService,
      authService as unknown as AuthService,
      notificationsService as never,
    );
  });

  it('auto-links an existing user by email and grants access immediately', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      mustChangePassword: false,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue(null);
    prisma.ownerAccessGrant.create.mockResolvedValue({
      id: 'grant-1',
      ownerId: 'owner-1',
      userId: 'user-1',
      status: OwnerAccessGrantStatus.ACTIVE,
      inviteEmail: null,
      verificationMethod: 'EMAIL_MATCH',
    });

    const result = await service.createPendingInvite({
      actorUserId: 'admin-1',
      orgId: 'org-1',
      ownerId: 'owner-1',
      email: ' Owner@Example.com ',
    });

    expect(result.status).toBe(OwnerAccessGrantStatus.ACTIVE);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'owner@example.com', mode: 'insensitive' } },
      select: { id: true, isActive: true, mustChangePassword: true },
    });
    expect(prisma.ownerAccessGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        ownerId: 'owner-1',
        status: OwnerAccessGrantStatus.ACTIVE,
        inviteEmail: null,
        grantedByUserId: 'admin-1',
        verificationMethod: 'EMAIL_MATCH',
      }),
    });
    expect(prisma.ownerAccessGrantAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantId: 'grant-1',
        ownerId: 'owner-1',
        actorUserId: 'admin-1',
        action: OwnerAccessGrantAuditAction.LINKED,
        fromStatus: null,
        toStatus: OwnerAccessGrantStatus.ACTIVE,
        userId: 'user-1',
        inviteEmail: null,
        verificationMethod: 'EMAIL_MATCH',
      }),
    });
    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['user-1'],
      type: 'OWNER_ACCESS_GRANTED',
      title: 'Owner access granted',
      body: 'You can now access Owner One.',
      data: {
        kind: 'owner_access',
        ownerId: 'owner-1',
        grantId: 'grant-1',
        status: OwnerAccessGrantStatus.ACTIVE,
      },
    });
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('keeps an existing user with pending password setup as pending and sends onboarding email', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      mustChangePassword: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue(null);
    prisma.ownerAccessGrant.create.mockResolvedValue({
      id: 'grant-1',
      ownerId: 'owner-1',
      userId: 'user-1',
      status: OwnerAccessGrantStatus.PENDING,
      inviteEmail: 'owner@example.com',
      verificationMethod: null,
    });

    const result = await service.createPendingInvite({
      actorUserId: 'admin-1',
      orgId: 'org-1',
      ownerId: 'owner-1',
      email: 'owner@example.com',
    });

    expect(result.status).toBe(OwnerAccessGrantStatus.PENDING);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.ownerAccessGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        ownerId: 'owner-1',
        status: OwnerAccessGrantStatus.PENDING,
        inviteEmail: 'owner@example.com',
        grantedByUserId: 'admin-1',
      }),
    });
    expect(prisma.ownerAccessGrantAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantId: 'grant-1',
        ownerId: 'owner-1',
        actorUserId: 'admin-1',
        action: OwnerAccessGrantAuditAction.INVITED,
        fromStatus: null,
        toStatus: OwnerAccessGrantStatus.PENDING,
        userId: 'user-1',
        inviteEmail: 'owner@example.com',
      }),
    });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'owner@example.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: 'admin-1',
      },
    );
    expect(notificationsService.createForUsers).not.toHaveBeenCalled();
  });

  it('creates a new owner portal user and sends onboarding email when no user matches the email', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-new' });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue(null);
    prisma.ownerAccessGrant.create.mockResolvedValue({
      id: 'grant-1',
      ownerId: 'owner-1',
      userId: 'user-new',
      status: OwnerAccessGrantStatus.PENDING,
      inviteEmail: 'owner@example.com',
      verificationMethod: null,
    });

    const result = await service.createPendingInvite({
      actorUserId: 'admin-1',
      orgId: 'org-1',
      ownerId: 'owner-1',
      email: 'owner@example.com',
    });

    expect(result.status).toBe(OwnerAccessGrantStatus.PENDING);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'owner@example.com',
        name: 'Owner One',
        orgId: null,
        mustChangePassword: true,
        isActive: true,
      }),
      select: { id: true },
    });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'owner@example.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: 'admin-1',
      },
    );
    expect(notificationsService.createForUsers).not.toHaveBeenCalled();
  });

  it('activates a pending grant to active without creating a new row', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'grant-pending',
        status: OwnerAccessGrantStatus.PENDING,
      })
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      mustChangePassword: false,
    });
    prisma.ownerAccessGrant.update.mockResolvedValue({
      id: 'grant-pending',
      ownerId: 'owner-1',
      userId: 'user-1',
      status: OwnerAccessGrantStatus.ACTIVE,
    });

    const result = await service.activatePendingGrant({
      actorUserId: 'admin-1',
      orgId: 'org-1',
      ownerId: 'owner-1',
      grantId: 'grant-pending',
      userId: 'user-1',
    });

    expect(result.status).toBe(OwnerAccessGrantStatus.ACTIVE);
    expect(prisma.ownerAccessGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant-pending' },
      data: expect.objectContaining({
        userId: 'user-1',
        status: OwnerAccessGrantStatus.ACTIVE,
        acceptedAt: expect.any(Date),
        inviteEmail: null,
        invitedAt: null,
        grantedByUserId: 'admin-1',
      }),
    });
    expect(prisma.ownerAccessGrantAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantId: 'grant-pending',
        ownerId: 'owner-1',
        actorUserId: 'admin-1',
        action: OwnerAccessGrantAuditAction.ACTIVATED,
        fromStatus: OwnerAccessGrantStatus.PENDING,
        toStatus: OwnerAccessGrantStatus.ACTIVE,
        userId: 'user-1',
      }),
    });
    expect(prisma.ownerAccessGrant.create).not.toHaveBeenCalled();
    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['user-1'],
      type: 'OWNER_ACCESS_GRANTED',
      title: 'Owner access granted',
      body: 'You can now access Owner One.',
      data: {
        kind: 'owner_access',
        ownerId: 'owner-1',
        grantId: 'grant-pending',
        status: OwnerAccessGrantStatus.ACTIVE,
      },
    });
  });

  it('rejects a second active representative for the same owner', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValueOnce({
      id: 'grant-active',
    });

    await expect(
      service.linkExistingUser({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        userId: 'user-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate open grant rows for the same user-owner pair', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'grant-open' });

    await expect(
      service.linkExistingUser({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a second pending invite for the same user-owner pair', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      mustChangePassword: false,
    });
    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'grant-pending' });

    await expect(
      service.createPendingInvite({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        email: 'user-1@test.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.ownerAccessGrant.create).not.toHaveBeenCalled();
  });

  it('disables an active grant without deleting its history', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue({
      id: 'grant-1',
      ownerId: 'owner-1',
      userId: 'user-1',
      status: OwnerAccessGrantStatus.ACTIVE,
      verificationMethod: 'ADMIN_LINK',
    });
    prisma.ownerAccessGrant.update.mockResolvedValue({
      id: 'grant-1',
      status: OwnerAccessGrantStatus.DISABLED,
    });

    const result = await service.disableGrant({
      actorUserId: 'admin-1',
      orgId: 'org-1',
      ownerId: 'owner-1',
      grantId: 'grant-1',
      verificationMethod: 'MANUAL_REVIEW',
    });

    expect(result.status).toBe(OwnerAccessGrantStatus.DISABLED);
    expect(prisma.ownerAccessGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant-1' },
      data: expect.objectContaining({
        status: OwnerAccessGrantStatus.DISABLED,
        disabledByUserId: 'admin-1',
        verificationMethod: 'MANUAL_REVIEW',
        disabledAt: expect.any(Date),
      }),
    });
    expect(prisma.ownerAccessGrantAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantId: 'grant-1',
        ownerId: 'owner-1',
        actorUserId: 'admin-1',
        action: OwnerAccessGrantAuditAction.DISABLED,
        fromStatus: OwnerAccessGrantStatus.ACTIVE,
        toStatus: OwnerAccessGrantStatus.DISABLED,
        userId: 'user-1',
        verificationMethod: 'MANUAL_REVIEW',
      }),
    });
    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['user-1'],
      type: 'OWNER_ACCESS_DISABLED',
      title: 'Owner access disabled',
      body: 'Owner One is no longer available in your portfolio.',
      data: {
        kind: 'owner_access',
        ownerId: 'owner-1',
        grantId: 'grant-1',
        status: OwnerAccessGrantStatus.DISABLED,
      },
    });
  });

  it('disables a pending grant', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue({
      id: 'grant-pending',
      ownerId: 'owner-1',
      status: OwnerAccessGrantStatus.PENDING,
      verificationMethod: null,
    });
    prisma.ownerAccessGrant.update.mockResolvedValue({
      id: 'grant-pending',
      status: OwnerAccessGrantStatus.DISABLED,
    });

    await expect(
      service.disableGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-pending',
      }),
    ).resolves.toMatchObject({
      status: OwnerAccessGrantStatus.DISABLED,
    });
  });

  it('rejects invalid transitions for disabled or non-pending activation attempts', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue({
      id: 'grant-disabled',
      ownerId: 'owner-1',
      status: OwnerAccessGrantStatus.DISABLED,
      verificationMethod: null,
    });

    await expect(
      service.disableGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-disabled',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'grant-active',
        status: OwnerAccessGrantStatus.ACTIVE,
      });
    await expect(
      service.activatePendingGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-active',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not allow reactivation of disabled grants', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'grant-1',
        status: OwnerAccessGrantStatus.DISABLED,
      });

    await expect(
      service.activatePendingGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not activate a pending grant when another active representative already exists for the owner', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValueOnce({
      id: 'grant-active',
    });

    await expect(
      service.activatePendingGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-pending',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.ownerAccessGrant.update).not.toHaveBeenCalled();
  });

  it('rejects activation when target user is missing or inactive', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'grant-pending',
        status: OwnerAccessGrantStatus.PENDING,
      });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.activatePendingGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-pending',
        userId: 'user-404',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects activation when target user has not completed password setup', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'grant-pending',
        status: OwnerAccessGrantStatus.PENDING,
      });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      mustChangePassword: true,
    });

    await expect(
      service.activatePendingGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-pending',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.ownerAccessGrant.update).not.toHaveBeenCalled();
  });

  it('rejects manual activation with reserved invite verification methods', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'grant-pending',
        status: OwnerAccessGrantStatus.PENDING,
      });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      mustChangePassword: false,
    });

    await expect(
      service.activatePendingGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-pending',
        userId: 'user-1',
        verificationMethod: 'EMAIL_MATCH',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ownerAccessGrant.update).not.toHaveBeenCalled();
  });

  it('only allows resend for pending grants', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue({
      id: 'grant-1',
      ownerId: 'owner-1',
      status: OwnerAccessGrantStatus.ACTIVE,
    });

    await expect(
      service.resendInvite({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'grant-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('resends setup recovery for active grants whose linked user still must change password', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue({
      id: 'grant-active',
      ownerId: 'owner-1',
      status: OwnerAccessGrantStatus.ACTIVE,
      userId: 'user-1',
      inviteEmail: null,
      verificationMethod: 'EMAIL_MATCH',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      isActive: true,
      mustChangePassword: true,
    });

    const result = await service.resendInvite({
      actorUserId: 'admin-1',
      orgId: 'org-1',
      ownerId: 'owner-1',
      grantId: 'grant-active',
    });

    expect(result.status).toBe(OwnerAccessGrantStatus.ACTIVE);
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'owner@example.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: 'admin-1',
      },
    );
    expect(prisma.ownerAccessGrantAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantId: 'grant-active',
        ownerId: 'owner-1',
        actorUserId: 'admin-1',
        action: OwnerAccessGrantAuditAction.RESENT,
        fromStatus: OwnerAccessGrantStatus.ACTIVE,
        toStatus: OwnerAccessGrantStatus.ACTIVE,
        userId: 'user-1',
        inviteEmail: 'owner@example.com',
        verificationMethod: 'EMAIL_MATCH',
      }),
    });
    expect(prisma.ownerAccessGrant.update).not.toHaveBeenCalled();
  });

  it('resend updates invite metadata for pending grants only', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue({
      id: 'grant-pending',
      ownerId: 'owner-1',
      status: OwnerAccessGrantStatus.PENDING,
      userId: 'user-1',
      inviteEmail: 'owner@example.com',
    });
    prisma.ownerAccessGrant.update.mockResolvedValue({
      id: 'grant-pending',
      ownerId: 'owner-1',
      userId: 'user-1',
      status: OwnerAccessGrantStatus.PENDING,
      inviteEmail: 'owner@example.com',
    });

    await service.resendInvite({
      actorUserId: 'admin-1',
      orgId: 'org-1',
      ownerId: 'owner-1',
      grantId: 'grant-pending',
    });

    expect(prisma.ownerAccessGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant-pending' },
      data: {
        invitedAt: expect.any(Date),
      },
    });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'owner@example.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: 'admin-1',
      },
    );
  });

  it('returns not found for unknown grant ids under an owner', async () => {
    prisma.owner.findFirst.mockResolvedValue({ id: 'owner-1', isActive: true });
    prisma.ownerAccessGrant.findFirst.mockResolvedValue(null);

    await expect(
      service.disableGrant({
        actorUserId: 'admin-1',
        orgId: 'org-1',
        ownerId: 'owner-1',
        grantId: 'missing-grant',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists owner access grant history for one owner', async () => {
    prisma.owner.findFirst.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Owner One',
      isActive: true,
    });
    prisma.ownerAccessGrantAudit.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        grantId: 'grant-1',
        ownerId: 'owner-1',
        actorUserId: 'admin-1',
        action: OwnerAccessGrantAuditAction.DISABLED,
        fromStatus: OwnerAccessGrantStatus.ACTIVE,
        toStatus: OwnerAccessGrantStatus.DISABLED,
        userId: 'user-1',
        inviteEmail: null,
        verificationMethod: 'MANUAL',
        createdAt: new Date(),
        actorUser: {
          id: 'admin-1',
          email: 'admin@example.com',
          name: 'Admin User',
        },
      },
    ]);

    const result = await service.listHistoryForOwner({
      orgId: 'org-1',
      ownerId: 'owner-1',
      grantId: 'grant-1',
      action: OwnerAccessGrantAuditAction.DISABLED,
    });

    expect(prisma.ownerAccessGrantAudit.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'owner-1',
        grantId: 'grant-1',
        action: OwnerAccessGrantAuditAction.DISABLED,
      },
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(result).toHaveLength(1);
  });
});

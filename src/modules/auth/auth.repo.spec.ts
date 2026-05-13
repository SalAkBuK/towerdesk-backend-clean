import {
  OwnerAccessGrantAuditAction,
  OwnerAccessGrantStatus,
  ResidentInviteStatus,
  ServiceProviderAccessGrantStatus,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthRepo } from './auth.repo';

describe('AuthRepo', () => {
  type ResetPasswordTx = {
    passwordResetToken: {
      findUnique: jest.Mock;
      update?: jest.Mock;
      deleteMany?: jest.Mock;
    };
    user: {
      update: jest.Mock;
    };
    ownerAccessGrant: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    ownerAccessGrantAudit: {
      create: jest.Mock;
    };
    notification: {
      create: jest.Mock;
    };
    residentInvite: {
      updateMany: jest.Mock;
    };
    serviceProviderAccessGrant: {
      updateMany: jest.Mock;
    };
  };

  let prisma: {
    residentInvite: {
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let authRepo: AuthRepo;

  beforeEach(() => {
    prisma = {
      residentInvite: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    authRepo = new AuthRepo(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates resident invite with SENT status', async () => {
    prisma.residentInvite.create.mockResolvedValue({});

    await authRepo.createResidentInvite({
      orgId: 'org-1',
      userId: 'user-1',
      createdByUserId: 'admin-1',
      email: 'resident@test.com',
      tokenHash: 'token-hash',
      expiresAt: new Date('2026-03-11T00:00:00.000Z'),
    });

    expect(prisma.residentInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          userId: 'user-1',
          createdByUserId: 'admin-1',
          status: ResidentInviteStatus.SENT,
          tokenHash: 'token-hash',
        }),
      }),
    );
  });

  it('marks invite as accepted when password reset token is valid', async () => {
    const now = new Date('2026-03-10T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const tx = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'prt-1',
          userId: 'user-1',
          purpose: 'RESIDENT_INVITE',
          usedAt: null,
          expiresAt: new Date('2026-03-10T12:00:00.000Z'),
          user: { id: 'user-1', isActive: true },
        }),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      ownerAccessGrant: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      ownerAccessGrantAudit: {
        create: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      residentInvite: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      serviceProviderAccessGrant: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (cb: (tx: ResetPasswordTx) => Promise<boolean>) => cb(tx),
    );

    const changed = await authRepo.resetPasswordByToken(
      'token-hash',
      'new-password-hash',
    );

    expect(changed).toBe(true);
    expect(tx.residentInvite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: 'token-hash',
          status: ResidentInviteStatus.SENT,
        },
        data: expect.objectContaining({
          status: ResidentInviteStatus.ACCEPTED,
          acceptedAt: now,
        }),
      }),
    );
    expect(tx.ownerAccessGrant.findMany).not.toHaveBeenCalled();
    expect(tx.serviceProviderAccessGrant.updateMany).not.toHaveBeenCalled();
  });

  it('does not mark invite accepted when password reset token is invalid', async () => {
    const tx = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        update: jest.fn(),
      },
      ownerAccessGrant: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      ownerAccessGrantAudit: {
        create: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      residentInvite: {
        updateMany: jest.fn(),
      },
      serviceProviderAccessGrant: {
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (cb: (tx: ResetPasswordTx) => Promise<boolean>) => cb(tx),
    );

    const changed = await authRepo.resetPasswordByToken(
      'missing-token-hash',
      'new-password-hash',
    );

    expect(changed).toBe(false);
    expect(tx.residentInvite.updateMany).not.toHaveBeenCalled();
  });

  it('activates pending owner access grants after password setup completes', async () => {
    const now = new Date('2026-03-10T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const tx = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'prt-1',
          userId: 'user-1',
          purpose: 'OWNER_INVITE',
          usedAt: null,
          expiresAt: new Date('2026-03-10T12:00:00.000Z'),
          user: { id: 'user-1', isActive: true },
        }),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      ownerAccessGrant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'grant-1',
            ownerId: 'owner-1',
            userId: 'user-1',
            inviteEmail: 'owner@example.com',
            verificationMethod: null,
            owner: {
              id: 'owner-1',
              orgId: 'org-1',
              name: 'Owner One',
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({
          id: 'grant-1',
          ownerId: 'owner-1',
          userId: 'user-1',
          verificationMethod: 'OWNER_INVITE',
        }),
      },
      ownerAccessGrantAudit: {
        create: jest.fn().mockResolvedValue({}),
      },
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
      residentInvite: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      serviceProviderAccessGrant: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (cb: (tx: ResetPasswordTx) => Promise<boolean>) => cb(tx),
    );

    const changed = await authRepo.resetPasswordByToken(
      'token-hash',
      'new-password-hash',
    );

    expect(changed).toBe(true);
    expect(tx.ownerAccessGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant-1' },
      data: {
        status: OwnerAccessGrantStatus.ACTIVE,
        acceptedAt: now,
        invitedAt: null,
        inviteEmail: null,
        disabledAt: null,
        disabledByUserId: null,
        verificationMethod: 'OWNER_INVITE',
      },
    });
    expect(tx.ownerAccessGrantAudit.create).toHaveBeenCalledWith({
      data: {
        grantId: 'grant-1',
        ownerId: 'owner-1',
        actorUserId: null,
        action: OwnerAccessGrantAuditAction.ACTIVATED,
        fromStatus: OwnerAccessGrantStatus.PENDING,
        toStatus: OwnerAccessGrantStatus.ACTIVE,
        userId: 'user-1',
        inviteEmail: 'owner@example.com',
        verificationMethod: 'OWNER_INVITE',
      },
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org-1',
        recipientUserId: 'user-1',
        type: 'OWNER_ACCESS_GRANTED',
        title: 'Owner access granted',
        body: 'You can now access Owner One.',
        data: {
          kind: 'owner_access',
          ownerId: 'owner-1',
          grantId: 'grant-1',
          status: OwnerAccessGrantStatus.ACTIVE,
        },
      },
    });
    expect(tx.serviceProviderAccessGrant.updateMany).not.toHaveBeenCalled();
  });

  it('does not complete invite side effects for plain password reset tokens', async () => {
    const now = new Date('2026-03-10T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const tx = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'prt-1',
          userId: 'user-1',
          purpose: 'PASSWORD_RESET',
          usedAt: null,
          expiresAt: new Date('2026-03-10T12:00:00.000Z'),
          user: { id: 'user-1', isActive: true },
        }),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      ownerAccessGrant: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      ownerAccessGrantAudit: {
        create: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      residentInvite: {
        updateMany: jest.fn(),
      },
      serviceProviderAccessGrant: {
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (cb: (tx: ResetPasswordTx) => Promise<boolean>) => cb(tx),
    );

    const changed = await authRepo.resetPasswordByToken(
      'token-hash',
      'new-password-hash',
    );

    expect(changed).toBe(true);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        passwordHash: 'new-password-hash',
        mustChangePassword: false,
        refreshTokenHash: null,
      },
    });
    expect(tx.residentInvite.updateMany).not.toHaveBeenCalled();
    expect(tx.ownerAccessGrant.findMany).not.toHaveBeenCalled();
    expect(tx.ownerAccessGrant.update).not.toHaveBeenCalled();
    expect(tx.ownerAccessGrantAudit.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.serviceProviderAccessGrant.updateMany).not.toHaveBeenCalled();
  });

  it('activates pending provider grants only for provider invite tokens', async () => {
    const now = new Date('2026-03-10T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const tx = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'prt-1',
          userId: 'user-1',
          purpose: 'PROVIDER_INVITE',
          usedAt: null,
          expiresAt: new Date('2026-03-10T12:00:00.000Z'),
          user: { id: 'user-1', isActive: true },
        }),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      ownerAccessGrant: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      ownerAccessGrantAudit: {
        create: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      residentInvite: {
        updateMany: jest.fn(),
      },
      serviceProviderAccessGrant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (cb: (tx: ResetPasswordTx) => Promise<boolean>) => cb(tx),
    );

    const changed = await authRepo.resetPasswordByToken(
      'token-hash',
      'new-password-hash',
    );

    expect(changed).toBe(true);
    expect(tx.residentInvite.updateMany).not.toHaveBeenCalled();
    expect(tx.ownerAccessGrant.findMany).not.toHaveBeenCalled();
    expect(tx.serviceProviderAccessGrant.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: ServiceProviderAccessGrantStatus.PENDING,
      },
      data: {
        status: ServiceProviderAccessGrantStatus.ACTIVE,
        acceptedAt: now,
        invitedAt: null,
        inviteEmail: null,
        disabledAt: null,
        disabledByUserId: null,
        verificationMethod: 'PROVIDER_INVITE',
      },
    });
  });
});

import * as argon2 from 'argon2';
import { PermissionEffect } from '@prisma/client';
import { OrgUserLifecycleService } from './org-user-lifecycle.service';
import { RESIDENT_BASELINE_PERMISSION_KEYS } from '../access-control/resident-baseline-permissions';

jest.mock('argon2', () => ({
  hash: jest.fn(),
}));

describe('OrgUserLifecycleService', () => {
  let tx: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    permission: {
      findMany: jest.Mock;
    };
    userPermission: {
      createMany: jest.Mock;
    };
    userAccessAssignment: {
      findFirst: jest.Mock;
      upsert: jest.Mock;
    };
    building: {
      findFirst: jest.Mock;
    };
    unit: {
      findFirst: jest.Mock;
    };
    occupancy: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $executeRaw: jest.Mock;
  };
  let prisma: {
    $transaction: jest.Mock;
    user: {
      findUnique: jest.Mock;
    };
  };
  let authService: {
    requestPasswordReset: jest.Mock;
  };
  let projectionService: {
    buildUserResponse: jest.Mock;
  };
  let service: OrgUserLifecycleService;

  beforeEach(() => {
    tx = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
      userPermission: {
        createMany: jest.fn(),
      },
      userAccessAssignment: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      building: {
        findFirst: jest.fn(),
      },
      unit: {
        findFirst: jest.fn(),
      },
      occupancy: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };

    prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
      user: {
        findUnique: jest.fn(),
      },
    };

    authService = {
      requestPasswordReset: jest.fn(),
    };

    projectionService = {
      buildUserResponse: jest.fn(),
    };

    service = new OrgUserLifecycleService(
      prisma as never,
      authService as never,
      projectionService as never,
    );

    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('grants resident baseline permissions for resident provisioning flows', async () => {
    const createdUser = {
      id: 'user-1',
      email: 'resident@example.com',
      name: 'Resident User',
      phone: null,
      avatarUrl: null,
      orgId: 'org-1',
      mustChangePassword: true,
      isActive: true,
      createdAt: new Date('2026-04-07T00:00:00.000Z'),
      updatedAt: new Date('2026-04-07T00:00:00.000Z'),
    };

    tx.user.findFirst.mockResolvedValue(null);
    tx.user.create.mockResolvedValue(createdUser);
    tx.permission.findMany.mockResolvedValue([
      { id: 'perm-messaging-read' },
      { id: 'perm-messaging-write' },
      { id: 'perm-move-in' },
      { id: 'perm-move-out' },
    ]);
    tx.userPermission.createMany.mockResolvedValue({ count: 4 });
    prisma.user.findUnique.mockResolvedValue(createdUser);
    projectionService.buildUserResponse.mockResolvedValue({
      id: createdUser.id,
      email: createdUser.email,
      effectivePermissions: [...RESIDENT_BASELINE_PERMISSION_KEYS],
    });

    await service.provisionOrgUser({
      orgId: 'org-1',
      identity: {
        email: createdUser.email,
        name: createdUser.name ?? undefined,
        sendInvite: false,
      },
      allowGeneratedPasswordWithoutInvite: true,
      mode: { ifEmailExists: 'ERROR', requireSameOrg: true },
      ensureResidentBaselinePermissions: true,
    });

    expect(tx.permission.findMany).toHaveBeenCalledWith({
      where: {
        key: { in: [...RESIDENT_BASELINE_PERMISSION_KEYS] },
      },
      select: { id: true },
    });
    expect(tx.userPermission.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: createdUser.id,
          permissionId: 'perm-messaging-read',
          effect: PermissionEffect.ALLOW,
        },
        {
          userId: createdUser.id,
          permissionId: 'perm-messaging-write',
          effect: PermissionEffect.ALLOW,
        },
        {
          userId: createdUser.id,
          permissionId: 'perm-move-in',
          effect: PermissionEffect.ALLOW,
        },
        {
          userId: createdUser.id,
          permissionId: 'perm-move-out',
          effect: PermissionEffect.ALLOW,
        },
      ],
      skipDuplicates: true,
    });
  });
});

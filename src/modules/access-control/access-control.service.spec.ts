import { PermissionEffect } from '@prisma/client';
import { AccessControlService } from './access-control.service';
import { AccessControlRepo } from './access-control.repo';

describe('AccessControlService', () => {
  let accessControlRepo: jest.Mocked<AccessControlRepo>;
  let accessControlService: AccessControlService;

  beforeEach(() => {
    accessControlRepo = {
      getUserScopedAccess: jest.fn(),
      getUserAccessAcrossAnyScope: jest.fn(),
    } as unknown as jest.Mocked<AccessControlRepo>;

    accessControlService = new AccessControlService(accessControlRepo);
  });

  it('computes effective permissions with allow and deny overrides', async () => {
    accessControlRepo.getUserScopedAccess.mockResolvedValue({
      assignments: [],
      rolePermissionKeys: ['users.read', 'roles.read'],
      userOverrides: [
        { key: 'users.write', effect: PermissionEffect.ALLOW },
        { key: 'roles.read', effect: PermissionEffect.DENY },
      ],
    });

    const result = await accessControlService.getUserEffectivePermissions(
      'user-1',
      {
        orgId: 'org-1',
      },
    );

    expect(result.has('users.read')).toBe(true);
    expect(result.has('users.write')).toBe(true);
    expect(result.has('roles.read')).toBe(false);
  });

  it('computes any-scope permissions with allow and deny overrides', async () => {
    accessControlRepo.getUserAccessAcrossAnyScope.mockResolvedValue({
      assignments: [],
      rolePermissionKeys: ['messaging.read'],
      userOverrides: [
        { key: 'messaging.write', effect: PermissionEffect.ALLOW },
        { key: 'messaging.read', effect: PermissionEffect.DENY },
      ],
    });

    const result =
      await accessControlService.getUserEffectivePermissionsAcrossAnyScope(
        'user-1',
        {
          orgId: 'org-1',
        },
      );

    expect(result.has('messaging.read')).toBe(false);
    expect(result.has('messaging.write')).toBe(true);
  });
});

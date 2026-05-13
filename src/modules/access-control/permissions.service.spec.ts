import { ForbiddenException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  const allPermissions = [
    {
      id: 'perm-1',
      key: 'roles.read',
      name: 'Read roles',
      description: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: 'perm-2',
      key: 'platform.org.create',
      name: 'Create orgs',
      description: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];

  it('hides platform permissions from org-scoped users', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue(null),
      listPermissions: jest.fn().mockResolvedValue(allPermissions),
    };
    const accessControlService = {
      getUserEffectivePermissions: jest
        .fn()
        .mockResolvedValue(new Set(['roles.read'])),
    };
    const service = new PermissionsService(
      accessControlRepo as never,
      accessControlService as never,
    );

    await expect(
      service.list({
        sub: 'org-user-1',
        email: 'org@example.com',
        orgId: 'org-1',
      }),
    ).resolves.toEqual([expect.objectContaining({ key: 'roles.read' })]);
  });

  it('returns platform permissions for platform superadmin', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue({ id: 'x' }),
      listPermissions: jest.fn().mockResolvedValue(allPermissions),
    };
    const accessControlService = {
      getUserEffectivePermissions: jest.fn(),
    };
    const service = new PermissionsService(
      accessControlRepo as never,
      accessControlService as never,
    );

    await expect(
      service.list({
        sub: 'platform-user-1',
        email: 'platform@example.com',
        orgId: null,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ key: 'roles.read' }),
      expect.objectContaining({ key: 'platform.org.create' }),
    ]);
    expect(
      accessControlService.getUserEffectivePermissions,
    ).not.toHaveBeenCalled();
  });

  it('hides platform permissions for platform superadmin acting in an org context', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue({ id: 'x' }),
      listPermissions: jest.fn().mockResolvedValue(allPermissions),
    };
    const accessControlService = {
      getUserEffectivePermissions: jest
        .fn()
        .mockResolvedValue(new Set(['roles.read'])),
    };
    const service = new PermissionsService(
      accessControlRepo as never,
      accessControlService as never,
    );

    await expect(
      service.list({
        sub: 'platform-user-1',
        email: 'platform@example.com',
        orgId: 'org-1',
      }),
    ).resolves.toEqual([expect.objectContaining({ key: 'roles.read' })]);
    expect(accessControlService.getUserEffectivePermissions).toHaveBeenCalled();
  });

  it('rejects users without roles.read and without platform superadmin access', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue(null),
      listPermissions: jest.fn(),
    };
    const accessControlService = {
      getUserEffectivePermissions: jest.fn().mockResolvedValue(new Set()),
    };
    const service = new PermissionsService(
      accessControlRepo as never,
      accessControlService as never,
    );

    await expect(
      service.list({
        sub: 'viewerless-user-1',
        email: 'user@example.com',
        orgId: 'org-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

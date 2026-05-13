import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AccessScopeType } from '@prisma/client';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  const buildRoleTemplate = (overrides?: Partial<Record<string, unknown>>) => ({
    id: 'role-1',
    orgId: 'org-1',
    key: 'leasing_ops',
    name: 'Leasing Ops',
    description: null,
    isSystem: false,
    scopeType: AccessScopeType.ORG,
    createdAt: new Date(),
    updatedAt: new Date(),
    rolePermissions: [],
    ...overrides,
  });

  it('lists only visible role templates', async () => {
    const accessControlRepo = {
      listRoleTemplatesWithPermissions: jest.fn().mockResolvedValue([
        buildRoleTemplate({
          id: 'system-1',
          key: 'org_admin',
          name: 'Org Admin',
          isSystem: true,
        }),
        buildRoleTemplate({
          id: 'system-2',
          key: 'platform_superadmin',
          name: 'Platform Superadmin',
          isSystem: true,
          orgId: null,
        }),
        buildRoleTemplate(),
      ]),
    };

    const service = new RolesService(accessControlRepo as never);
    const roles = await service.list('org-1');

    expect(roles.map((role) => role.key)).toEqual(['org_admin', 'leasing_ops']);
  });

  it('requires org_admin to create role templates', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue(null),
    };

    const service = new RolesService(accessControlRepo as never);

    await expect(
      service.create('actor-1', 'org-1', {
        key: 'custom_role',
        name: 'Custom Role',
        scopeType: AccessScopeType.ORG,
        permissionKeys: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reserved role template keys before persistence', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue({ id: 'ua-1' }),
    };

    const service = new RolesService(accessControlRepo as never);

    await expect(
      service.create('actor-1', 'org-1', {
        key: 'platform_superadmin',
        name: 'Platform Superadmin',
        scopeType: AccessScopeType.ORG,
        permissionKeys: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps duplicate role template key errors to ConflictException', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue({ id: 'ua-1' }),
      findPermissionsByKeys: jest.fn().mockResolvedValue([]),
      createRoleTemplate: jest.fn().mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`orgId`,`key`)',
      }),
    };

    const service = new RolesService(accessControlRepo as never);

    await expect(
      service.create('actor-1', 'org-1', {
        key: 'custom_role',
        name: 'Custom Role',
        scopeType: AccessScopeType.ORG,
        permissionKeys: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects platform permission keys for org role templates', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue({ id: 'ua-1' }),
    };

    const service = new RolesService(accessControlRepo as never);

    await expect(
      service.create('actor-1', 'org-1', {
        key: 'custom_role',
        name: 'Custom Role',
        scopeType: AccessScopeType.ORG,
        permissionKeys: ['roles.read', 'platform.org.create'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to delete system role templates', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue({ id: 'ua-1' }),
      findRoleTemplateById: jest.fn().mockResolvedValue(
        buildRoleTemplate({
          id: 'role-1',
          key: 'org_admin',
          isSystem: true,
        }),
      ),
    };

    const service = new RolesService(accessControlRepo as never);

    await expect(
      service.delete('actor-1', 'org-1', 'role-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to delete custom role templates that are still assigned', async () => {
    const accessControlRepo = {
      hasUserRoleTemplateKeyInOrg: jest.fn().mockResolvedValue({ id: 'ua-1' }),
      findRoleTemplateById: jest.fn().mockResolvedValue(buildRoleTemplate()),
      countUsersAssignedToRoleTemplate: jest.fn().mockResolvedValue(2),
    };

    const service = new RolesService(accessControlRepo as never);

    await expect(
      service.delete('actor-1', 'org-1', 'role-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

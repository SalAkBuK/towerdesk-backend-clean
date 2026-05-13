import { AccessScopeType } from '@prisma/client';
import { AccessControlRepo } from './access-control.repo';

describe('AccessControlRepo', () => {
  it('excludes hidden role templates from scoped assignments and effective permissions', async () => {
    const assignments = [
      {
        id: 'hidden-assignment',
        roleTemplate: {
          key: 'admin',
          isSystem: true,
          rolePermissions: [
            {
              permission: {
                key: 'users.write',
              },
            },
          ],
        },
      },
      {
        id: 'visible-assignment',
        roleTemplate: {
          key: 'viewer',
          isSystem: true,
          rolePermissions: [
            {
              permission: {
                key: 'users.read',
              },
            },
          ],
        },
      },
    ];

    const prisma = {
      userAccessAssignment: {
        findMany: jest.fn().mockResolvedValue(assignments),
      },
      userPermission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const repo = new AccessControlRepo(prisma as never);

    const result = await repo.getUserScopedAccess('user-1', {
      orgId: 'org-1',
      buildingId: 'building-1',
    });

    expect(prisma.userAccessAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          roleTemplate: { orgId: 'org-1' },
          OR: [
            {
              scopeType: AccessScopeType.ORG,
              scopeId: null,
              roleTemplate: { scopeType: AccessScopeType.ORG },
            },
            {
              scopeType: AccessScopeType.BUILDING,
              scopeId: 'building-1',
              roleTemplate: { scopeType: AccessScopeType.BUILDING },
            },
          ],
        }),
      }),
    );
    expect(result.assignments).toEqual([assignments[1]]);
    expect(result.rolePermissionKeys).toEqual(['users.read']);
  });
});

import { BuildingAssignmentsService } from './building-assignments.service';

describe('BuildingAssignmentsService', () => {
  it('maps building-scoped assignments and preserves legacy type compatibility', async () => {
    const accessControlRepo = {
      listBuildingAccessAssignments: jest.fn().mockResolvedValue([
        {
          id: 'assignment-1',
          userId: 'user-1',
          roleTemplateId: 'role-1',
          scopeType: 'BUILDING',
          scopeId: 'building-1',
          roleTemplate: {
            key: 'building_manager',
            isSystem: true,
          },
          user: {
            id: 'user-1',
            email: 'manager@example.com',
            name: 'Manager',
            avatarUrl: null,
            phone: null,
            isActive: true,
          },
        },
        {
          id: 'assignment-2',
          userId: 'user-2',
          roleTemplateId: 'role-2',
          scopeType: 'BUILDING',
          scopeId: 'building-1',
          roleTemplate: {
            key: 'platform_superadmin',
            isSystem: true,
          },
          user: {
            id: 'user-2',
            email: 'hidden@example.com',
            name: 'Hidden',
            avatarUrl: null,
            phone: null,
            isActive: true,
          },
        },
      ]),
    };

    const service = new BuildingAssignmentsService(accessControlRepo as never);

    await expect(
      service.listAssignments('org-1', 'building-1'),
    ).resolves.toEqual([
      {
        id: 'assignment-1',
        assignmentId: 'assignment-1',
        buildingId: 'building-1',
        userId: 'user-1',
        roleTemplateId: 'role-1',
        roleTemplateKey: 'building_manager',
        scopeType: 'BUILDING',
        scopeId: 'building-1',
        type: 'MANAGER',
        user: {
          id: 'user-1',
          email: 'manager@example.com',
          name: 'Manager',
          avatarUrl: null,
          phone: null,
          isActive: true,
        },
      },
    ]);
    expect(
      accessControlRepo.listBuildingAccessAssignments,
    ).toHaveBeenCalledWith('building-1', 'org-1');
  });
});

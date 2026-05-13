import {
  AccessScopeType,
  OwnerAccessGrantStatus,
  ResidentInviteStatus,
  ServiceProviderAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessControlService } from './access-control.service';
import { RESIDENT_BASELINE_PERMISSION_KEYS } from './resident-baseline-permissions';
import { UserAccessProjectionService } from './user-access-projection.service';

describe('UserAccessProjectionService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    userAccessAssignment: { findMany: jest.Mock };
    occupancy: { findFirst: jest.Mock; count: jest.Mock };
    residentProfile: { findFirst: jest.Mock };
    residentInvite: { findFirst: jest.Mock };
    ownerAccessGrant: { findMany: jest.Mock };
    serviceProviderUser: { findMany: jest.Mock };
    userPermission: { findMany: jest.Mock };
  };
  let accessControlService: jest.Mocked<AccessControlService>;
  let service: UserAccessProjectionService;

  const baseUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    avatarUrl: null,
    phone: null,
    isActive: true,
    orgId: 'org-1',
    mustChangePassword: false,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      userAccessAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      occupancy: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      residentProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      residentInvite: { findFirst: jest.fn().mockResolvedValue(null) },
      ownerAccessGrant: { findMany: jest.fn().mockResolvedValue([]) },
      serviceProviderUser: { findMany: jest.fn().mockResolvedValue([]) },
      userPermission: { findMany: jest.fn().mockResolvedValue([]) },
    };

    accessControlService = {
      getUserEffectivePermissions: jest.fn().mockResolvedValue(new Set()),
    } as unknown as jest.Mocked<AccessControlService>;

    service = new UserAccessProjectionService(
      prisma as unknown as PrismaService,
      accessControlService,
    );
  });

  it('marks invited residents without occupancy as residents in the auth payload', async () => {
    prisma.residentInvite.findFirst.mockResolvedValue({
      status: ResidentInviteStatus.ACCEPTED,
      expiresAt: new Date('2026-04-20T00:00:00.000Z'),
    });
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(RESIDENT_BASELINE_PERMISSION_KEYS),
    );

    const result = await service.buildUserResponse(baseUser, 'org-1');

    expect(result.resident).toBeNull();
    expect(result.persona).toEqual({
      keys: ['RESIDENT'],
      isResident: true,
      residentOccupancyStatus: 'NONE',
      residentInviteStatus: 'ACCEPTED',
      isOwner: false,
      isServiceProvider: false,
      serviceProviderRoles: [],
      isBuildingStaff: false,
      buildingStaffRoleKeys: [],
      isOrgAdmin: false,
      isPlatformAdmin: false,
    });
  });

  it('projects combined resident, owner, provider, and building access markers', async () => {
    prisma.userAccessAssignment.findMany.mockResolvedValue([
      {
        id: 'org-admin-assignment',
        scopeType: AccessScopeType.ORG,
        scopeId: null,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        roleTemplate: {
          key: 'org_admin',
          isSystem: true,
          rolePermissions: [],
        },
      },
      {
        id: 'building-manager-assignment',
        scopeType: AccessScopeType.BUILDING,
        scopeId: 'building-1',
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        roleTemplate: {
          key: 'building_manager',
          isSystem: true,
          rolePermissions: [],
        },
      },
    ]);
    prisma.occupancy.findFirst.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    prisma.occupancy.count.mockResolvedValue(1);
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { status: OwnerAccessGrantStatus.ACTIVE },
    ]);
    prisma.serviceProviderUser.findMany.mockResolvedValue([
      {
        serviceProviderId: 'provider-1',
        role: ServiceProviderUserRole.ADMIN,
        serviceProvider: {
          accessGrants: [{ status: ServiceProviderAccessGrantStatus.ACTIVE }],
        },
      },
      {
        serviceProviderId: 'provider-2',
        role: ServiceProviderUserRole.WORKER,
        serviceProvider: {
          accessGrants: [{ status: ServiceProviderAccessGrantStatus.PENDING }],
        },
      },
    ]);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['resident.profile.read']),
    );

    const result = await service.buildUserResponse(baseUser, 'org-1');

    expect(result.orgAccess).toEqual([
      {
        assignmentId: 'org-admin-assignment',
        roleTemplateKey: 'org_admin',
        scopeType: AccessScopeType.ORG,
        scopeId: null,
      },
    ]);
    expect(result.buildingAccess).toEqual([
      {
        assignmentId: 'building-manager-assignment',
        roleTemplateKey: 'building_manager',
        scopeType: AccessScopeType.BUILDING,
        scopeId: 'building-1',
      },
    ]);
    expect(result.resident).toEqual({
      occupancyId: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    expect(result.persona).toEqual({
      keys: [
        'RESIDENT',
        'OWNER',
        'SERVICE_PROVIDER',
        'BUILDING_STAFF',
        'ORG_ADMIN',
      ],
      isResident: true,
      residentOccupancyStatus: 'ACTIVE',
      residentInviteStatus: null,
      isOwner: true,
      isServiceProvider: true,
      serviceProviderRoles: [ServiceProviderUserRole.ADMIN],
      isBuildingStaff: true,
      buildingStaffRoleKeys: ['building_manager'],
      isOrgAdmin: true,
      isPlatformAdmin: false,
    });
  });
});

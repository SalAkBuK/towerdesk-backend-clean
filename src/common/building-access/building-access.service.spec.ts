import { BuildingAccessService } from './building-access.service';
import { AccessControlService } from '../../modules/access-control/access-control.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

describe('BuildingAccessService', () => {
  let prisma: {
    building: { findFirst: jest.Mock };
    occupancy: { findFirst: jest.Mock };
  };
  let accessControlService: jest.Mocked<AccessControlService>;
  let service: BuildingAccessService;

  beforeEach(() => {
    prisma = {
      building: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'building-1', orgId: 'org-1' }),
      },
      occupancy: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    accessControlService = {
      getUserEffectivePermissions: jest.fn(),
    } as unknown as jest.Mocked<AccessControlService>;

    service = new BuildingAccessService(
      prisma as unknown as PrismaService,
      accessControlService,
    );
  });

  it('accepts leases.read as an alias for contracts.read on building-scoped reads', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['leases.read']),
    );

    const allowed = await service.canReadBuildingResource(
      { sub: 'user-1', orgId: 'org-1', email: 'user@test.com' },
      'building-1',
      {
        requiredPermissions: ['contracts.read'],
      },
    );

    expect(allowed).toBe(true);
  });

  it('accepts leases.write as an alias for contracts.write on building-scoped writes', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['leases.write']),
    );

    const allowed = await service.canWriteBuildingResource(
      { sub: 'user-1', orgId: 'org-1', email: 'user@test.com' },
      'building-1',
      {
        requiredPermissions: ['contracts.write'],
      },
    );

    expect(allowed).toBe(true);
  });

  it('denies writes when scoped permissions are missing', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );

    const allowed = await service.canWriteBuildingResource(
      { sub: 'user-1', orgId: 'org-1', email: 'user@test.com' },
      'building-1',
      {
        requiredPermissions: ['contracts.write'],
      },
    );

    expect(allowed).toBe(false);
  });

  it('allows resident-safe reads through active occupancy without permissions', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );
    prisma.occupancy.findFirst.mockResolvedValue({
      id: 'occ-1',
      buildingId: 'building-1',
      residentUserId: 'user-1',
      status: 'ACTIVE',
    });

    const allowed = await service.canReadBuildingResource(
      { sub: 'user-1', orgId: 'org-1', email: 'user@test.com' },
      'building-1',
      {
        requiredPermissions: ['units.read'],
        allowResident: true,
      },
    );

    expect(allowed).toBe(true);
  });
});

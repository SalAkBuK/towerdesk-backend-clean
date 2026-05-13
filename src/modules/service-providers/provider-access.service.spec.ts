import { ConflictException } from '@nestjs/common';
import { ServiceProviderAccessGrantStatus } from '@prisma/client';
import { ProviderAccessService } from './provider-access.service';
import { ServiceProvidersRepo } from './service-providers.repo';

describe('ProviderAccessService', () => {
  let repo: jest.Mocked<ServiceProvidersRepo>;
  let service: ProviderAccessService;

  beforeEach(() => {
    repo = {
      findActiveMembershipsForUser: jest.fn(),
    } as unknown as jest.Mocked<ServiceProvidersRepo>;

    service = new ProviderAccessService(repo);
  });

  it('allows provider memberships with no access grant rows', async () => {
    repo.findActiveMembershipsForUser.mockResolvedValue([
      {
        serviceProviderId: 'provider-1',
        userId: 'user-1',
        role: 'WORKER',
        isActive: true,
        serviceProvider: {
          accessGrants: [],
        },
      },
    ] as never);

    const memberships = await service.listAccessibleMemberships('user-1');

    expect(memberships).toHaveLength(1);
    expect(memberships[0].serviceProviderId).toBe('provider-1');
    expect(memberships[0].requiresGrant).toBe(false);
  });

  it('blocks pending invite memberships until the grant is active', async () => {
    repo.findActiveMembershipsForUser.mockResolvedValue([
      {
        serviceProviderId: 'provider-1',
        userId: 'user-1',
        role: 'ADMIN',
        isActive: true,
        serviceProvider: {
          accessGrants: [
            {
              userId: 'user-1',
              status: ServiceProviderAccessGrantStatus.PENDING,
            },
          ],
        },
      },
    ] as never);

    await expect(service.listAccessibleMemberships('user-1')).resolves.toEqual(
      [],
    );
  });

  it('rejects ambiguous provider portal context when multiple memberships are active', async () => {
    repo.findActiveMembershipsForUser.mockResolvedValue([
      {
        serviceProviderId: 'provider-1',
        userId: 'user-1',
        role: 'ADMIN',
        isActive: true,
        serviceProvider: {
          accessGrants: [
            {
              userId: 'user-1',
              status: ServiceProviderAccessGrantStatus.ACTIVE,
            },
          ],
        },
      },
      {
        serviceProviderId: 'provider-2',
        userId: 'user-1',
        role: 'ADMIN',
        isActive: true,
        serviceProvider: {
          accessGrants: [],
        },
      },
    ] as never);

    await expect(
      service.getSingleAccessibleMembership('user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

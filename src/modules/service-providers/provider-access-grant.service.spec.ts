import {
  ServiceProviderAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { ServiceProvidersRepo } from './service-providers.repo';
import { ProviderAccessGrantService } from './provider-access-grant.service';

describe('ProviderAccessGrantService', () => {
  let repo: jest.Mocked<ServiceProvidersRepo>;
  let authService: jest.Mocked<AuthService>;
  let service: ProviderAccessGrantService;

  beforeEach(() => {
    repo = {
      findByIdForOrg: jest.fn(),
      countOpenAccessGrants: jest.fn(),
      findUserByEmailInsensitive: jest.fn(),
      createStandaloneUser: jest.fn(),
      upsertMembership: jest.fn(),
      createAccessGrant: jest.fn(),
      listAccessGrants: jest.fn(),
      findAccessGrant: jest.fn(),
      updateAccessGrant: jest.fn(),
    } as unknown as jest.Mocked<ServiceProvidersRepo>;

    authService = {
      requestPasswordReset: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    service = new ProviderAccessGrantService(repo, authService);
  });

  it('creates a pending provider-admin invite and admin membership for a new standalone user', async () => {
    repo.findByIdForOrg.mockResolvedValue({
      id: 'provider-1',
      name: 'RapidFix',
      contactName: 'Nadia Khan',
    } as never);
    repo.countOpenAccessGrants.mockResolvedValue(0);
    repo.findUserByEmailInsensitive.mockResolvedValue(null);
    repo.createStandaloneUser.mockResolvedValue({
      id: 'user-1',
      email: 'admin@rapidfix.test',
      orgId: null,
      isActive: true,
    } as never);
    repo.upsertMembership.mockResolvedValue({
      serviceProviderId: 'provider-1',
      userId: 'user-1',
      role: ServiceProviderUserRole.ADMIN,
      isActive: true,
    } as never);
    repo.createAccessGrant.mockResolvedValue({
      id: 'grant-1',
      status: ServiceProviderAccessGrantStatus.PENDING,
      inviteEmail: 'admin@rapidfix.test',
      user: {
        id: 'user-1',
        email: 'admin@rapidfix.test',
        name: 'Nadia Khan',
        phone: null,
        orgId: null,
        isActive: true,
        mustChangePassword: true,
      },
    } as never);
    authService.requestPasswordReset.mockResolvedValue({
      success: true,
    } as never);

    const grant = await service.createPendingInvite({
      actorUserId: 'manager-1',
      orgId: 'org-1',
      providerId: 'provider-1',
      email: 'admin@rapidfix.test',
    });

    expect(repo.upsertMembership).toHaveBeenCalledWith(
      'provider-1',
      'user-1',
      ServiceProviderUserRole.ADMIN,
      true,
    );
    expect(repo.createAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ServiceProviderAccessGrantStatus.PENDING,
        inviteEmail: 'admin@rapidfix.test',
      }),
    );
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'admin@rapidfix.test',
      expect.objectContaining({
        purpose: 'PROVIDER_INVITE',
        issuedByUserId: 'manager-1',
      }),
    );
    expect(grant.status).toBe(ServiceProviderAccessGrantStatus.PENDING);
  });
});

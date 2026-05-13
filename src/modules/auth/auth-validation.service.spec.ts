import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthValidationService } from './auth-validation.service';
import { AuthRepo } from './auth.repo';

describe('AuthValidationService', () => {
  let service: AuthValidationService;
  let authRepo: jest.Mocked<AuthRepo>;

  beforeEach(() => {
    authRepo = {
      findById: jest.fn(),
      getRoleKeys: jest.fn(),
    } as unknown as jest.Mocked<AuthRepo>;

    service = new AuthValidationService(authRepo, {} as unknown as JwtService);
  });

  it('uses the current database org scope when the token org claim is stale', async () => {
    authRepo.findById.mockResolvedValue({
      id: 'user-1',
      email: 'resident@example.com',
      isActive: true,
      orgId: 'org-current',
    } as never);

    await expect(
      service.validatePayload({
        sub: 'user-1',
        email: 'resident@example.com',
        orgId: 'org-stale',
      }),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'resident@example.com',
      orgId: 'org-current',
    });
  });

  it('allows platform superadmin org override when the user has no default org', async () => {
    authRepo.findById.mockResolvedValue({
      id: 'user-1',
      email: 'platform@example.com',
      isActive: true,
      orgId: null,
    } as never);
    authRepo.getRoleKeys.mockResolvedValue(['platform_superadmin']);

    await expect(
      service.validatePayload(
        { sub: 'user-1', email: 'platform@example.com' },
        '11111111-1111-1111-1111-111111111111',
      ),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'platform@example.com',
      orgId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('rejects inactive users', async () => {
    authRepo.findById.mockResolvedValue({
      id: 'user-1',
      email: 'inactive@example.com',
      isActive: false,
      orgId: 'org-1',
    } as never);

    await expect(
      service.validatePayload({ sub: 'user-1', email: 'inactive@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid org overrides', () => {
    expect(() => service.parseOrgIdOverride('not-a-uuid')).toThrow(
      BadRequestException,
    );
  });
});

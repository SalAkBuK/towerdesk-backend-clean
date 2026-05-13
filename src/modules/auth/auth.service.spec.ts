import * as argon2 from 'argon2';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessScopeType, User } from '@prisma/client';
import { UserAccessProjectionService } from '../access-control/user-access-projection.service';
import { RESIDENT_BASELINE_PERMISSION_KEYS } from '../access-control/resident-baseline-permissions';
import { env } from '../../config/env';
import { AuthRepo } from './auth.repo';
import { AuthPasswordDeliveryService } from './auth-password-delivery.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

describe('AuthService', () => {
  let authRepo: jest.Mocked<AuthRepo>;
  let jwtService: jest.Mocked<JwtService>;
  let authPasswordDeliveryService: jest.Mocked<AuthPasswordDeliveryService>;
  let userAccessProjectionService: jest.Mocked<UserAccessProjectionService>;
  let authService: AuthService;
  let originalRegisterEnabled: boolean;
  let originalResetTemplate: string | undefined;
  let originalIosUrl: string | undefined;
  let originalAndroidUrl: string | undefined;
  let originalDeepLinkUrl: string | undefined;

  const baseUser = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    refreshTokenHash: null,
    name: null,
    orgId: null,
    mustChangePassword: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(() => {
    originalRegisterEnabled = env.AUTH_PUBLIC_REGISTER_ENABLED;
    originalResetTemplate = env.AUTH_PASSWORD_RESET_URL_TEMPLATE;
    originalIosUrl = env.MOBILE_APP_IOS_URL;
    originalAndroidUrl = env.MOBILE_APP_ANDROID_URL;
    originalDeepLinkUrl = env.MOBILE_APP_DEEP_LINK_URL;
    env.AUTH_PUBLIC_REGISTER_ENABLED = true;
    env.AUTH_PASSWORD_RESET_URL_TEMPLATE =
      'https://portal.towerdesk.test/reset';
    env.MOBILE_APP_IOS_URL = 'https://apps.apple.com/app/towerdesk/id123456';
    env.MOBILE_APP_ANDROID_URL =
      'https://play.google.com/store/apps/details?id=com.towerdesk.app';
    env.MOBILE_APP_DEEP_LINK_URL = 'towerdesk://onboarding';

    authRepo = {
      findByEmail: jest.fn(),
      findByEmailInsensitive: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      clearRefreshTokenHash: jest.fn(),
      createPasswordResetToken: jest.fn(),
      createResidentInvite: jest.fn(),
      markResidentInviteFailed: jest.fn(),
      resetPasswordByToken: jest.fn(),
      getRoleKeys: jest.fn().mockResolvedValue([]),
      getHighestBuildingAssignmentType: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<AuthRepo>;

    jwtService = {
      signAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    authPasswordDeliveryService = {
      enqueuePasswordResetEmail: jest.fn(),
    } as unknown as jest.Mocked<AuthPasswordDeliveryService>;

    userAccessProjectionService = {
      buildUserResponse: jest.fn(async (user: User) => ({
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        avatarUrl: null,
        phone: null,
        isActive: user.isActive,
        orgId: user.orgId ?? null,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        orgAccess: [],
        buildingAccess: [],
        effectivePermissions: [],
        resident: null,
        permissionOverrides: null,
        persona: {
          keys: [],
          isResident: false,
          residentOccupancyStatus: null,
          residentInviteStatus: null,
          isOwner: false,
          isServiceProvider: false,
          serviceProviderRoles: [],
          isBuildingStaff: false,
          buildingStaffRoleKeys: [],
          isOrgAdmin: false,
          isPlatformAdmin: false,
        },
      })),
    } as unknown as jest.Mocked<UserAccessProjectionService>;

    authService = new AuthService(
      authRepo,
      jwtService,
      authPasswordDeliveryService,
      userAccessProjectionService,
    );
  });

  afterEach(() => {
    env.AUTH_PUBLIC_REGISTER_ENABLED = originalRegisterEnabled;
    env.AUTH_PASSWORD_RESET_URL_TEMPLATE = originalResetTemplate;
    env.MOBILE_APP_IOS_URL = originalIosUrl;
    env.MOBILE_APP_ANDROID_URL = originalAndroidUrl;
    env.MOBILE_APP_DEEP_LINK_URL = originalDeepLinkUrl;
  });

  it('registers a user and returns tokens', async () => {
    const dto: RegisterDto = {
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    };

    authRepo.findByEmail.mockResolvedValue(null);
    authRepo.createUser.mockResolvedValue({
      ...baseUser,
      email: dto.email,
      name: dto.name ?? null,
    });
    authRepo.updateRefreshTokenHash.mockResolvedValue(baseUser);

    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await authService.register(dto);

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.email).toBe(dto.email);

    const createArgs = authRepo.createUser.mock.calls[0][0];
    expect(createArgs.email).toBe(dto.email);
    expect(createArgs.passwordHash).not.toBe(dto.password);
    expect(typeof createArgs.passwordHash).toBe('string');
  });

  it('logs in a user and returns tokens', async () => {
    const dto: LoginDto = {
      email: 'user@example.com',
      password: 'password123',
    };
    const passwordHash = await argon2.hash(dto.password);

    authRepo.findByEmail.mockResolvedValue({
      ...baseUser,
      passwordHash,
    });
    authRepo.updateRefreshTokenHash.mockResolvedValue(baseUser);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await authService.login(dto);

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.email).toBe(dto.email);
  });

  it('returns projected building-scoped access in the auth payload', async () => {
    const dto: LoginDto = {
      email: 'user@example.com',
      password: 'password123',
    };
    const passwordHash = await argon2.hash(dto.password);

    authRepo.findByEmail.mockResolvedValue({
      ...baseUser,
      passwordHash,
      orgId: 'org-1',
    });
    userAccessProjectionService.buildUserResponse.mockResolvedValue({
      id: baseUser.id,
      email: baseUser.email,
      name: null,
      avatarUrl: null,
      phone: null,
      isActive: true,
      orgId: 'org-1',
      mustChangePassword: false,
      createdAt: baseUser.createdAt,
      updatedAt: baseUser.updatedAt,
      orgAccess: [],
      buildingAccess: [
        {
          assignmentId: 'assignment-1',
          roleTemplateKey: 'building_admin',
          scopeType: AccessScopeType.BUILDING,
          scopeId: 'building-1',
        },
      ],
      effectivePermissions: ['messaging.read'],
      resident: null,
      permissionOverrides: null,
      persona: {
        keys: ['BUILDING_STAFF'],
        isResident: false,
        residentOccupancyStatus: null,
        residentInviteStatus: null,
        isOwner: false,
        isServiceProvider: false,
        serviceProviderRoles: [],
        isBuildingStaff: true,
        buildingStaffRoleKeys: ['building_admin'],
        isOrgAdmin: false,
        isPlatformAdmin: false,
      },
    });
    authRepo.updateRefreshTokenHash.mockResolvedValue(baseUser);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await authService.login(dto);

    expect(result.user.buildingAccess).toEqual([
      {
        assignmentId: 'assignment-1',
        roleTemplateKey: 'building_admin',
        scopeType: AccessScopeType.BUILDING,
        scopeId: 'building-1',
      },
    ]);
    expect(result.user.effectivePermissions).toEqual(['messaging.read']);
  });

  it('returns projected org-scoped access in the auth payload', async () => {
    const dto: LoginDto = {
      email: 'user@example.com',
      password: 'password123',
    };
    const passwordHash = await argon2.hash(dto.password);

    authRepo.findByEmail.mockResolvedValue({
      ...baseUser,
      passwordHash,
      orgId: 'org-1',
    });
    userAccessProjectionService.buildUserResponse.mockResolvedValue({
      id: baseUser.id,
      email: baseUser.email,
      name: null,
      avatarUrl: null,
      phone: null,
      isActive: true,
      orgId: 'org-1',
      mustChangePassword: false,
      createdAt: baseUser.createdAt,
      updatedAt: baseUser.updatedAt,
      orgAccess: [
        {
          assignmentId: 'assignment-1',
          roleTemplateKey: 'org_admin',
          scopeType: AccessScopeType.ORG,
          scopeId: null,
        },
      ],
      buildingAccess: [],
      effectivePermissions: ['users.write', 'roles.write'],
      resident: null,
      permissionOverrides: null,
      persona: {
        keys: ['ORG_ADMIN'],
        isResident: false,
        residentOccupancyStatus: null,
        residentInviteStatus: null,
        isOwner: false,
        isServiceProvider: false,
        serviceProviderRoles: [],
        isBuildingStaff: false,
        buildingStaffRoleKeys: [],
        isOrgAdmin: true,
        isPlatformAdmin: false,
      },
    });
    authRepo.updateRefreshTokenHash.mockResolvedValue(baseUser);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await authService.login(dto);

    expect(result.user.orgAccess).toEqual([
      {
        assignmentId: 'assignment-1',
        roleTemplateKey: 'org_admin',
        scopeType: AccessScopeType.ORG,
        scopeId: null,
      },
    ]);
    expect(result.user.effectivePermissions).toEqual([
      'users.write',
      'roles.write',
    ]);
  });

  it('returns resident baseline permissions in the auth payload', async () => {
    const dto: LoginDto = {
      email: 'resident@example.com',
      password: 'password123',
    };
    const passwordHash = await argon2.hash(dto.password);

    authRepo.findByEmail.mockResolvedValue({
      ...baseUser,
      email: dto.email,
      passwordHash,
      orgId: 'org-1',
      name: 'Resident User',
    });
    userAccessProjectionService.buildUserResponse.mockResolvedValue({
      id: baseUser.id,
      email: dto.email,
      name: 'Resident User',
      avatarUrl: null,
      phone: null,
      isActive: true,
      orgId: 'org-1',
      mustChangePassword: false,
      createdAt: baseUser.createdAt,
      updatedAt: baseUser.updatedAt,
      orgAccess: [],
      buildingAccess: [],
      effectivePermissions: [...RESIDENT_BASELINE_PERMISSION_KEYS],
      resident: {
        occupancyId: 'occupancy-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
      },
      permissionOverrides: null,
      persona: {
        keys: ['RESIDENT'],
        isResident: true,
        residentOccupancyStatus: 'ACTIVE',
        residentInviteStatus: null,
        isOwner: false,
        isServiceProvider: false,
        serviceProviderRoles: [],
        isBuildingStaff: false,
        buildingStaffRoleKeys: [],
        isOrgAdmin: false,
        isPlatformAdmin: false,
      },
    });
    authRepo.updateRefreshTokenHash.mockResolvedValue(baseUser);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await authService.login(dto);

    expect(result.user.resident).toEqual({
      occupancyId: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    expect(result.user.effectivePermissions).toEqual([
      ...RESIDENT_BASELINE_PERMISSION_KEYS,
    ]);
  });

  it('blocks public registration when disabled', async () => {
    env.AUTH_PUBLIC_REGISTER_ENABLED = false;

    await expect(
      authService.register({
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refreshes tokens with a valid refresh token', async () => {
    const refreshToken = 'refresh-token';
    const refreshTokenHash = await argon2.hash(refreshToken);

    authRepo.findById.mockResolvedValue({
      ...baseUser,
      refreshTokenHash,
    });
    authRepo.updateRefreshTokenHash.mockResolvedValue(baseUser);
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');

    const result = await authService.refresh(baseUser.id, refreshToken);

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('invalidates refresh token after logout', async () => {
    const refreshToken = 'refresh-token';
    const userState: User = {
      ...baseUser,
      refreshTokenHash: await argon2.hash(refreshToken),
    };

    authRepo.findById.mockImplementation(async () => userState);
    authRepo.updateRefreshTokenHash.mockImplementation(
      async (_userId: string, refreshTokenHash: string) => {
        userState.refreshTokenHash = refreshTokenHash;
        return userState;
      },
    );
    authRepo.clearRefreshTokenHash.mockImplementation(async () => {
      userState.refreshTokenHash = null;
    });

    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');

    await authService.refresh(baseUser.id, refreshToken);

    const result = await authService.logout(baseUser.id);

    expect(result).toEqual({ success: true });
    expect(authRepo.clearRefreshTokenHash).toHaveBeenCalledWith(baseUser.id);
    await expect(
      authService.refresh(baseUser.id, 'any-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requests password reset and dispatches an email for an active user', async () => {
    authRepo.findByEmailInsensitive.mockResolvedValue(baseUser);
    authRepo.createPasswordResetToken.mockResolvedValue();
    authPasswordDeliveryService.enqueuePasswordResetEmail.mockResolvedValue(
      {} as never,
    );

    const result = await authService.requestPasswordReset(baseUser.email);

    expect(result).toEqual({ success: true });
    expect(authRepo.createPasswordResetToken).toHaveBeenCalledTimes(1);
    const [userId, tokenHash, expiresAt] =
      authRepo.createPasswordResetToken.mock.calls[0];
    expect(userId).toBe(baseUser.id);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt).toBeInstanceOf(Date);
    expect(
      authPasswordDeliveryService.enqueuePasswordResetEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        email: baseUser.email,
        tokenHash,
        expiresAt,
        purpose: 'PASSWORD_RESET',
      }),
    );
  });

  it('queues invite-style onboarding email when purpose is resident invite', async () => {
    authRepo.findByEmailInsensitive.mockResolvedValue({
      ...baseUser,
      orgId: 'org-1',
      name: 'Resident User',
    });
    authRepo.findById.mockResolvedValue({
      ...baseUser,
      id: 'inviter-1',
      name: 'Org Admin',
    });
    authRepo.createPasswordResetToken.mockResolvedValue();
    authRepo.createResidentInvite.mockResolvedValue();
    authPasswordDeliveryService.enqueuePasswordResetEmail.mockResolvedValue(
      {} as never,
    );

    const result = await authService.requestPasswordReset(baseUser.email, {
      purpose: 'RESIDENT_INVITE',
      issuedByUserId: 'inviter-1',
    });

    expect(result).toEqual({ success: true });
    expect(authRepo.createPasswordResetToken).toHaveBeenCalledTimes(1);
    expect(authRepo.createResidentInvite).toHaveBeenCalledTimes(1);
    expect(
      authPasswordDeliveryService.enqueuePasswordResetEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        email: baseUser.email,
        purpose: 'RESIDENT_INVITE',
        orgId: 'org-1',
        userId: baseUser.id,
        context: {
          inviteeName: 'Resident User',
          inviterName: 'Org Admin',
        },
      }),
    );
  });

  it('does not create resident invite records for forgot-password emails', async () => {
    authRepo.findByEmailInsensitive.mockResolvedValue({
      ...baseUser,
      orgId: 'org-1',
    });
    authRepo.createPasswordResetToken.mockResolvedValue();
    await authService.requestPasswordReset(baseUser.email);

    expect(authRepo.createResidentInvite).not.toHaveBeenCalled();
    expect(authRepo.markResidentInviteFailed).not.toHaveBeenCalled();
  });

  it('does not create resident invite records when user has no org', async () => {
    authRepo.findByEmailInsensitive.mockResolvedValue({
      ...baseUser,
      orgId: null,
    });
    authRepo.createPasswordResetToken.mockResolvedValue();
    authPasswordDeliveryService.enqueuePasswordResetEmail.mockResolvedValue(
      {} as never,
    );

    await authService.requestPasswordReset(baseUser.email, {
      purpose: 'RESIDENT_INVITE',
    });

    expect(authRepo.createResidentInvite).not.toHaveBeenCalled();
    expect(
      authPasswordDeliveryService.enqueuePasswordResetEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'RESIDENT_INVITE',
        orgId: null,
      }),
    );
  });

  it('returns success for unknown password reset emails without queuing delivery', async () => {
    authRepo.findByEmailInsensitive.mockResolvedValue(null);

    const result = await authService.requestPasswordReset(
      'missing@example.com',
    );

    expect(result).toEqual({ success: true });
    expect(authRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(
      authPasswordDeliveryService.enqueuePasswordResetEmail,
    ).not.toHaveBeenCalled();
  });

  it('passes resident invite context through to the queued delivery service', async () => {
    authRepo.findByEmailInsensitive.mockResolvedValue({
      ...baseUser,
      orgId: 'org-1',
      name: 'Resident User',
    });
    authRepo.findById.mockResolvedValue({
      ...baseUser,
      id: 'inviter-1',
      name: 'Org Admin',
    });
    authRepo.createPasswordResetToken.mockResolvedValue();
    authRepo.createResidentInvite.mockResolvedValue();
    authPasswordDeliveryService.enqueuePasswordResetEmail.mockResolvedValue(
      {} as never,
    );

    await authService.requestPasswordReset(baseUser.email, {
      purpose: 'RESIDENT_INVITE',
      issuedByUserId: 'inviter-1',
    });

    expect(
      authPasswordDeliveryService.enqueuePasswordResetEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          inviteeName: 'Resident User',
          inviterName: 'Org Admin',
        },
      }),
    );
  });

  it('resets password with a valid password reset token', async () => {
    authRepo.resetPasswordByToken.mockResolvedValue(true);

    const result = await authService.resetPassword('token-123', 'Password123!');

    expect(result).toEqual({ success: true });
    expect(authRepo.resetPasswordByToken).toHaveBeenCalledTimes(1);
    const [tokenHash, passwordHash] =
      authRepo.resetPasswordByToken.mock.calls[0];
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(passwordHash).not.toBe('Password123!');
  });

  it('rejects reset when password reset token is invalid or expired', async () => {
    authRepo.resetPasswordByToken.mockResolvedValue(false);

    await expect(
      authService.resetPassword('invalid-token', 'Password123!'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

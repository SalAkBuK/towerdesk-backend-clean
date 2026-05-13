import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PlatformAuthGuard } from './platform-auth.guard';
import { AccessControlService } from '../../modules/access-control/access-control.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { env } from '../../config/env';

describe('PlatformAuthGuard', () => {
  let jwtService: jest.Mocked<JwtService>;
  let prisma: jest.Mocked<PrismaService>;
  let accessControlService: jest.Mocked<AccessControlService>;
  let reflector: jest.Mocked<Reflector>;
  let guard: PlatformAuthGuard;
  let originalPlatformApiKey: string | undefined;
  let findUnique: jest.Mock;

  const createContext = (request: Record<string, unknown>) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    originalPlatformApiKey = env.PLATFORM_API_KEY;
    env.PLATFORM_API_KEY = 'platform-secret';

    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    findUnique = jest.fn();
    prisma = {
      user: {
        findUnique,
      },
    } as unknown as jest.Mocked<PrismaService>;

    accessControlService = {
      getUserEffectivePermissions: jest.fn(),
    } as unknown as jest.Mocked<AccessControlService>;

    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new PlatformAuthGuard(
      jwtService,
      prisma,
      accessControlService,
      reflector,
    );
  });

  afterEach(() => {
    env.PLATFORM_API_KEY = originalPlatformApiKey;
  });

  it('allows requests with the platform api key', async () => {
    const result = await guard.canActivate(
      createContext({
        headers: { 'x-platform-key': 'platform-secret' },
      }),
    );

    expect(result).toBe(true);
  });

  it('allows bearer-authenticated platform users with hidden platform permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(['platform.org.read']);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      orgId: null,
    } as never);
    findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'platform@example.com',
      orgId: null,
      isActive: true,
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['platform.org.read']),
    );

    const request = {
      headers: { authorization: 'Bearer token-1' },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(
      accessControlService.getUserEffectivePermissions,
    ).toHaveBeenCalledWith('user-1', {
      orgId: null,
      includeHiddenRoleTemplates: true,
    });
  });

  it('rejects bearer-authenticated platform users when required permissions are missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(['platform.org.read']);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      orgId: null,
    } as never);
    findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'platform@example.com',
      orgId: null,
      isActive: true,
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );

    await expect(
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer token-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects requests without platform auth', async () => {
    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

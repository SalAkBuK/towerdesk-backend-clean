import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BuildingScopeResolverService } from '../building-access/building-scope-resolver.service';
import { PermissionsGuard } from './permissions.guard';
import { AccessControlService } from '../../modules/access-control/access-control.service';

describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let accessControlService: jest.Mocked<AccessControlService>;
  let buildingScopeResolver: jest.Mocked<BuildingScopeResolverService>;
  let guard: PermissionsGuard;

  const createContext = (request: Record<string, unknown>) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    accessControlService = {
      getUserEffectivePermissions: jest.fn(),
      getUserEffectivePermissionsAcrossAnyScope: jest.fn(),
    } as unknown as jest.Mocked<AccessControlService>;

    buildingScopeResolver = {
      resolveForRequest: jest.fn(),
    } as unknown as jest.Mocked<BuildingScopeResolverService>;

    guard = new PermissionsGuard(
      reflector,
      accessControlService,
      buildingScopeResolver,
    );
  });

  it('allows when no permissions are required', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);

    const result = await guard.canActivate(createContext({}));

    expect(result).toBe(true);
  });

  it('allows when permissions are satisfied', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(['users.read'])
      .mockReturnValueOnce(undefined);
    buildingScopeResolver.resolveForRequest.mockResolvedValue(undefined);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['users.read', 'roles.read']),
    );

    const request = { user: { sub: 'user-1' } };
    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it('allows when an alias permission is satisfied', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(['contracts.read'])
      .mockReturnValueOnce(undefined);
    buildingScopeResolver.resolveForRequest.mockResolvedValue(undefined);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['leases.read']),
    );

    const request = { user: { sub: 'user-1' } };
    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it('throws when permissions are missing', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(['roles.write'])
      .mockReturnValueOnce(undefined);
    buildingScopeResolver.resolveForRequest.mockResolvedValue(undefined);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['roles.read']),
    );

    const request = { user: { sub: 'user-1' } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when user is missing', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(['roles.read'])
      .mockReturnValueOnce(undefined);

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('passes resolved building scope into permission evaluation', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(['leases.read'])
      .mockReturnValueOnce(undefined);
    buildingScopeResolver.resolveForRequest.mockResolvedValue('building-9');
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['leases.read']),
    );

    const request = {
      user: { sub: 'user-1', orgId: 'org-1' },
      params: { leaseId: 'lease-1' },
      route: { path: '/leases/:leaseId' },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(buildingScopeResolver.resolveForRequest).toHaveBeenCalledWith(
      request,
      'org-1',
    );
    expect(
      accessControlService.getUserEffectivePermissions,
    ).toHaveBeenCalledWith('user-1', {
      orgId: 'org-1',
      buildingId: 'building-9',
    });
  });

  it('allows any-scope permission fallback when explicitly enabled', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(['messaging.read'])
      .mockReturnValueOnce(true);
    buildingScopeResolver.resolveForRequest.mockResolvedValue(undefined);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );
    accessControlService.getUserEffectivePermissionsAcrossAnyScope = jest
      .fn()
      .mockResolvedValue(new Set(['messaging.read']));

    const request = {
      user: { sub: 'user-1', orgId: 'org-1' },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(
      accessControlService.getUserEffectivePermissionsAcrossAnyScope,
    ).toHaveBeenCalledWith('user-1', {
      orgId: 'org-1',
    });
  });
});

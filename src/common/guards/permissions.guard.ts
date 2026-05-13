import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_ANY_SCOPE_PERMISSIONS_KEY } from '../decorators/allow-any-scope-permissions.decorator';
import { BuildingScopeResolverService } from '../building-access/building-scope-resolver.service';
import { AccessControlService } from '../../modules/access-control/access-control.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RequestContext } from '../types/request-context';
import { hasAllPermissionMatches } from '../utils/permission-aliases';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
    private readonly buildingScopeResolver: BuildingScopeResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const allowAnyScopePermissions =
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_ANY_SCOPE_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? false;
    if (!permissions || permissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!request.effectivePermissions) {
      const buildingId = await this.buildingScopeResolver.resolveForRequest(
        request,
        request.user?.orgId ?? null,
      );

      request.effectivePermissions =
        await this.accessControlService.getUserEffectivePermissions(userId, {
          orgId: request.user?.orgId ?? null,
          buildingId,
        });
    }

    const hasAll = hasAllPermissionMatches(
      request.effectivePermissions,
      permissions,
    );
    if (!hasAll && allowAnyScopePermissions) {
      const effectivePermissions =
        await this.accessControlService.getUserEffectivePermissionsAcrossAnyScope(
          userId,
          {
            orgId: request.user?.orgId ?? null,
          },
        );
      if (hasAllPermissionMatches(effectivePermissions, permissions)) {
        request.effectivePermissions = effectivePermissions;
        return true;
      }
    }
    if (!hasAll) {
      throw new ForbiddenException('Missing required permissions');
    }

    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AccessControlService } from '../../modules/access-control/access-control.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { env } from '../../config/env';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RequestContext } from '../types/request-context';

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly accessControlService: AccessControlService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestContext>();

    const headerKey = request.headers['x-platform-key'];
    const providedKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;

    if (env.PLATFORM_API_KEY && providedKey === env.PLATFORM_API_KEY) {
      return true;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Invalid platform key');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Unauthorized');
    }

    let payload: { sub: string; email?: string; orgId?: string | null };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (payload.orgId !== undefined && payload.orgId !== (user.orgId ?? null)) {
      throw new UnauthorizedException('Unauthorized');
    }

    request.user = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId ?? null,
    };

    if (user.orgId !== null) {
      throw new ForbiddenException('Platform access requires platform user');
    }

    const permissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (permissions.length === 0) {
      throw new ForbiddenException('Missing required permissions');
    }

    if (!request.effectivePermissions) {
      request.effectivePermissions =
        await this.accessControlService.getUserEffectivePermissions(user.id, {
          orgId: user.orgId ?? null,
          includeHiddenRoleTemplates: true,
        });
    }

    const hasAll = permissions.every((permission) =>
      request.effectivePermissions?.has(permission),
    );
    if (!hasAll) {
      throw new ForbiddenException('Missing required permissions');
    }

    return true;
  }
}

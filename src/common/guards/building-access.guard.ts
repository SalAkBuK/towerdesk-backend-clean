import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BUILDING_ACCESS_LEVEL_KEY,
  BUILDING_RESIDENT_ALLOWED_KEY,
  BuildingAccessLevel,
} from '../decorators/building-access.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RequestContext } from '../types/request-context';
import { BuildingAccessService } from '../building-access/building-access.service';

@Injectable()
export class BuildingAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly buildingAccessService: BuildingAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const accessLevel = this.reflector.getAllAndOverride<BuildingAccessLevel>(
      BUILDING_ACCESS_LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!accessLevel) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const buildingId = request.params?.buildingId;
    if (!buildingId || typeof buildingId !== 'string') {
      throw new BadRequestException('buildingId is required');
    }

    const user = request.user;
    if (!user?.sub) {
      throw new UnauthorizedException('Unauthorized');
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const allowResident =
      this.reflector.getAllAndOverride<boolean>(BUILDING_RESIDENT_ALLOWED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    const allowed =
      accessLevel === 'read'
        ? await this.buildingAccessService.canReadBuildingResource(
            user,
            buildingId,
            {
              requiredPermissions,
              allowResident,
              effectivePermissions: request.effectivePermissions,
            },
          )
        : await this.buildingAccessService.canWriteBuildingResource(
            user,
            buildingId,
            {
              requiredPermissions,
              effectivePermissions: request.effectivePermissions,
            },
          );

    if (!allowed) {
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessControlRepo } from './access-control.repo';
import { AuthenticatedUser } from '../../common/types/request-context';
import {
  PermissionResponseDto,
  toPermissionResponse,
} from './dto/permission.response.dto';
import { AccessControlService } from './access-control.service';
import { isPlatformPermissionKey } from './permission-keys';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly accessControlRepo: AccessControlRepo,
    private readonly accessControlService: AccessControlService,
  ) {}

  async list(user: AuthenticatedUser): Promise<PermissionResponseDto[]> {
    const isPlatformSuperadmin =
      await this.accessControlRepo.hasUserRoleTemplateKeyInOrg(
        user.sub,
        null,
        'platform_superadmin',
      );

    const isPlatformContext = user.orgId == null;

    if (!isPlatformSuperadmin || !isPlatformContext) {
      const effectivePermissions =
        await this.accessControlService.getUserEffectivePermissions(user.sub, {
          orgId: user.orgId ?? null,
        });
      if (!effectivePermissions.has('roles.read')) {
        throw new ForbiddenException('Missing required permissions');
      }
    }

    const permissions = await this.accessControlRepo.listPermissions();
    const visiblePermissions =
      isPlatformSuperadmin && isPlatformContext
        ? permissions
        : permissions.filter(
            (permission) => !isPlatformPermissionKey(permission.key),
          );

    return visiblePermissions.map(toPermissionResponse);
  }
}

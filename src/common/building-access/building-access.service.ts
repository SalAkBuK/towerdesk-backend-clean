import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessControlService } from '../../modules/access-control/access-control.service';
import { AuthenticatedUser } from '../types/request-context';
import { hasAllPermissionMatches } from '../utils/permission-aliases';
import { assertOrgScope } from '../utils/org-scope';

type AccessOptions = {
  requiredPermissions?: string[];
  allowResident?: boolean;
  effectivePermissions?: Set<string>;
};

@Injectable()
export class BuildingAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async assertBuildingInOrg(buildingId: string, orgId: string) {
    if (!orgId) {
      throw new ForbiddenException('Org scope required');
    }

    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, orgId },
    });
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return building;
  }

  async hasActiveOccupancy(buildingId: string, userId: string) {
    const occupancy = await this.prisma.occupancy.findFirst({
      where: {
        buildingId,
        residentUserId: userId,
        status: 'ACTIVE',
      },
    });
    return Boolean(occupancy);
  }

  async canReadBuildingResource(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    options: AccessOptions = {},
  ) {
    const orgId = assertOrgScope(user);
    await this.assertBuildingInOrg(buildingId, orgId);

    const userId = user?.sub;
    if (!userId) {
      return false;
    }

    const hasRequiredPermissions = await this.hasScopedPermissions(
      userId,
      orgId,
      buildingId,
      options,
    );
    if (hasRequiredPermissions) {
      return true;
    }

    if (options.allowResident) {
      return this.hasActiveOccupancy(buildingId, userId);
    }

    return false;
  }

  async canWriteBuildingResource(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    options: AccessOptions = {},
  ) {
    const orgId = assertOrgScope(user);
    await this.assertBuildingInOrg(buildingId, orgId);

    const userId = user?.sub;
    if (!userId) {
      return false;
    }

    return this.hasScopedPermissions(userId, orgId, buildingId, options);
  }

  async userHasAnyBuildingAccess(
    userId: string,
    orgId: string,
    buildingId: string,
  ) {
    const effective =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
        buildingId,
      });

    return effective.size > 0;
  }

  private async hasScopedPermissions(
    userId: string,
    orgId: string,
    buildingId: string,
    options: AccessOptions,
  ): Promise<boolean> {
    const requiredPermissions = options.requiredPermissions ?? [];
    if (requiredPermissions.length === 0) {
      return false;
    }

    const effective =
      options.effectivePermissions ??
      (await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
        buildingId,
      }));

    return hasAllPermissionMatches(effective, requiredPermissions);
  }
}

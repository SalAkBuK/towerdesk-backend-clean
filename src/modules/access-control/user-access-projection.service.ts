import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessScopeType,
  OwnerAccessGrantStatus,
  ResidentInviteStatus,
  ServiceProviderAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  toUserResponse,
  UserAccessAssignmentDto,
  UserPersona,
  UserPersonaSummaryDto,
  UserPermissionOverrideDto,
  UserResidentInviteStatus,
  UserResidentOccupancyStatus,
  UserResponseDto,
} from '../users/dto/user.response.dto';
import { AccessControlService } from './access-control.service';
import { isVisibleRoleTemplate } from './role-defaults';
import { RESIDENT_BASELINE_PERMISSION_KEYS } from './resident-baseline-permissions';

type UserRecord = {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  isActive: boolean;
  orgId?: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BuildUserResponseOptions = {
  includePermissionOverrides?: boolean;
};

@Injectable()
export class UserAccessProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async buildUserResponseById(
    userId: string,
    orgId: string | null,
    options?: BuildUserResponseOptions,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.buildUserResponse(user, orgId, options);
  }

  async buildUserResponse(
    user: UserRecord,
    orgId: string | null,
    options?: BuildUserResponseOptions,
  ): Promise<UserResponseDto> {
    const metadata = await this.buildUserResponseMetadata(
      user.id,
      orgId,
      options,
    );
    return toUserResponse(user, metadata);
  }

  private async buildUserResponseMetadata(
    userId: string,
    orgId: string | null,
    options?: BuildUserResponseOptions,
  ) {
    const [
      accessAssignments,
      residentOccupancy,
      residentOccupancyCount,
      residentProfile,
      latestResidentInvite,
      ownerAccessGrants,
      providerMemberships,
      effectivePermissions,
      permissionOverrides,
    ] = await Promise.all([
      orgId !== undefined
        ? this.prisma.userAccessAssignment.findMany({
            where: {
              userId,
              roleTemplate: { orgId },
            },
            include: {
              roleTemplate: true,
            },
            orderBy: [
              { scopeType: 'asc' },
              { scopeId: 'asc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
          })
        : Promise.resolve([]),
      orgId
        ? this.prisma.occupancy.findFirst({
            where: {
              residentUserId: userId,
              status: 'ACTIVE',
              building: { orgId },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve(null),
      orgId
        ? this.prisma.occupancy.count({
            where: {
              residentUserId: userId,
              building: { orgId },
            },
          })
        : Promise.resolve(0),
      orgId
        ? this.prisma.residentProfile.findFirst({
            where: {
              orgId,
              userId,
            },
            select: { userId: true },
          })
        : Promise.resolve(null),
      orgId
        ? this.prisma.residentInvite.findFirst({
            where: {
              orgId,
              userId,
            },
            orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
            select: {
              status: true,
              expiresAt: true,
            },
          })
        : Promise.resolve(null),
      this.prisma.ownerAccessGrant.findMany({
        where: {
          userId,
          status: {
            in: [OwnerAccessGrantStatus.PENDING, OwnerAccessGrantStatus.ACTIVE],
          },
        },
        select: {
          status: true,
        },
      }),
      this.prisma.serviceProviderUser.findMany({
        where: {
          userId,
          isActive: true,
          user: { isActive: true },
          serviceProvider: { isActive: true },
        },
        select: {
          serviceProviderId: true,
          role: true,
          serviceProvider: {
            select: {
              accessGrants: {
                where: { userId },
                select: { status: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { serviceProviderId: 'asc' }],
      }),
      this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
      }),
      options?.includePermissionOverrides
        ? this.prisma.userPermission.findMany({
            where: { userId },
            include: {
              permission: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const normalizedAssignments: UserAccessAssignmentDto[] = accessAssignments
      .filter((assignment) => isVisibleRoleTemplate(assignment.roleTemplate))
      .map((assignment) => ({
        assignmentId: assignment.id,
        roleTemplateKey: assignment.roleTemplate.key,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
      }));

    const orgAccess = normalizedAssignments.filter(
      (assignment) => assignment.scopeType === AccessScopeType.ORG,
    );
    const buildingAccess = normalizedAssignments.filter(
      (assignment) => assignment.scopeType === AccessScopeType.BUILDING,
    );

    const resident = residentOccupancy
      ? {
          occupancyId: residentOccupancy.id,
          unitId: residentOccupancy.unitId,
          buildingId: residentOccupancy.buildingId,
        }
      : null;

    const normalizedOverrides: UserPermissionOverrideDto[] | null =
      options?.includePermissionOverrides
        ? permissionOverrides.map((override) => ({
            permissionKey: override.permission.key,
            effect: override.effect,
          }))
        : null;

    const persona = this.buildPersonaSummary({
      accessAssignments,
      orgAccess,
      buildingAccess,
      residentOccupancy,
      residentOccupancyCount,
      hasResidentProfile: Boolean(residentProfile),
      latestResidentInvite,
      ownerAccessGrants,
      providerMemberships,
      effectivePermissions,
    });

    return {
      orgAccess,
      buildingAccess,
      resident,
      effectivePermissions: Array.from(effectivePermissions).sort(),
      permissionOverrides: normalizedOverrides,
      persona,
    };
  }

  private buildPersonaSummary(input: {
    accessAssignments: Array<{
      scopeType: AccessScopeType;
      scopeId: string | null;
      roleTemplate: { key: string; isSystem?: boolean | null };
    }>;
    orgAccess: UserAccessAssignmentDto[];
    buildingAccess: UserAccessAssignmentDto[];
    residentOccupancy: {
      id: string;
      buildingId: string;
      unitId: string;
    } | null;
    residentOccupancyCount: number;
    hasResidentProfile: boolean;
    latestResidentInvite: {
      status: ResidentInviteStatus;
      expiresAt: Date;
    } | null;
    ownerAccessGrants: Array<{
      status: OwnerAccessGrantStatus;
    }>;
    providerMemberships: Array<{
      serviceProviderId: string;
      role: ServiceProviderUserRole;
      serviceProvider: {
        accessGrants: Array<{
          status: ServiceProviderAccessGrantStatus;
        }>;
      };
    }>;
    effectivePermissions: Set<string>;
  }): UserPersonaSummaryDto {
    const residentInviteStatus = this.toResidentInviteStatus(
      input.latestResidentInvite,
    );
    const residentPermissionMatch = RESIDENT_BASELINE_PERMISSION_KEYS.some(
      (permissionKey) => input.effectivePermissions.has(permissionKey),
    );
    const isResident =
      Boolean(input.residentOccupancy) ||
      input.residentOccupancyCount > 0 ||
      input.hasResidentProfile ||
      Boolean(input.latestResidentInvite) ||
      residentPermissionMatch;

    const residentOccupancyStatus: UserResidentOccupancyStatus | null =
      !isResident
        ? null
        : input.residentOccupancy
          ? 'ACTIVE'
          : input.residentOccupancyCount > 0
            ? 'FORMER'
            : 'NONE';

    const isOwner = input.ownerAccessGrants.length > 0;

    const accessibleProviderRoles = Array.from(
      new Set(
        input.providerMemberships
          .filter((membership) => {
            const grantStatuses = membership.serviceProvider.accessGrants.map(
              (grant) => grant.status,
            );
            const requiresGrant = grantStatuses.length > 0;
            const hasActiveGrant = grantStatuses.includes(
              ServiceProviderAccessGrantStatus.ACTIVE,
            );
            return !requiresGrant || hasActiveGrant;
          })
          .map((membership) => membership.role),
      ),
    ).sort();
    const isServiceProvider = accessibleProviderRoles.length > 0;

    const buildingStaffRoleKeys = Array.from(
      new Set(
        input.buildingAccess.map((assignment) => assignment.roleTemplateKey),
      ),
    ).sort();
    const isBuildingStaff = buildingStaffRoleKeys.length > 0;
    const isOrgAdmin = input.orgAccess.some(
      (assignment) => assignment.roleTemplateKey === 'org_admin',
    );
    const isPlatformAdmin = input.accessAssignments.some(
      (assignment) =>
        assignment.scopeType === AccessScopeType.ORG &&
        assignment.scopeId === null &&
        assignment.roleTemplate.key === 'platform_superadmin',
    );

    const keys: UserPersona[] = [];
    if (isResident) {
      keys.push('RESIDENT');
    }
    if (isOwner) {
      keys.push('OWNER');
    }
    if (isServiceProvider) {
      keys.push('SERVICE_PROVIDER');
    }
    if (isBuildingStaff) {
      keys.push('BUILDING_STAFF');
    }
    if (isOrgAdmin) {
      keys.push('ORG_ADMIN');
    }
    if (isPlatformAdmin) {
      keys.push('PLATFORM_ADMIN');
    }

    return {
      keys,
      isResident,
      residentOccupancyStatus,
      residentInviteStatus,
      isOwner,
      isServiceProvider,
      serviceProviderRoles: accessibleProviderRoles,
      isBuildingStaff,
      buildingStaffRoleKeys,
      isOrgAdmin,
      isPlatformAdmin,
    };
  }

  private toResidentInviteStatus(
    invite: { status: ResidentInviteStatus; expiresAt: Date } | null,
  ): UserResidentInviteStatus | null {
    if (!invite) {
      return null;
    }

    if (invite.status === ResidentInviteStatus.ACCEPTED) {
      return 'ACCEPTED';
    }
    if (invite.status === ResidentInviteStatus.FAILED) {
      return 'FAILED';
    }

    return invite.expiresAt.getTime() > Date.now() ? 'PENDING' : 'EXPIRED';
  }
}

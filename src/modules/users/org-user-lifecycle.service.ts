import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessScopeType, PermissionEffect, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { UserAccessProjectionService } from '../access-control/user-access-projection.service';
import { AuthService } from '../auth/auth.service';
import { PasswordResetEmailPurpose } from '../auth/auth.types';
import { AuthenticatedUser } from '../../common/types/request-context';
import { mapOccupancyConstraintError } from '../../common/utils/occupancy-constraints';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  ProvisionAccessAssignmentDto,
  ProvisionIfEmailExists,
  ResidentGrantDto,
} from './dto/provision-user.dto';
import {
  UserAccessAssignmentDto,
  UserResidentDto,
  UserResponseDto,
} from './dto/user.response.dto';
import {
  describeEmailOwnershipConflict,
  normalizeEmail,
} from './user-identity.util';
import { isVisibleRoleTemplate } from '../access-control/role-defaults';
import { buildUserAccessAssignmentId } from '../access-control/access-assignment-id.util';
import { RESIDENT_BASELINE_PERMISSION_KEYS } from '../access-control/resident-baseline-permissions';

type ProvisionIdentity = {
  email: string;
  name?: string;
  phone?: string | null;
  password?: string;
  sendInvite?: boolean;
};

type ProvisionMode = {
  ifEmailExists?: ProvisionIfEmailExists;
  requireSameOrg?: boolean;
};

type OrgUserProvisionParams = {
  actor?: AuthenticatedUser;
  orgId: string;
  identity: ProvisionIdentity;
  accessAssignments?: ProvisionAccessAssignmentDto[];
  resident?: ResidentGrantDto;
  mode?: ProvisionMode;
  allowGeneratedPasswordWithoutInvite?: boolean;
  invitePurpose?: PasswordResetEmailPurpose;
  enforceActorProvisioningRules?: boolean;
  ensureResidentBaselinePermissions?: boolean;
};

type ProvisionMutationResult = {
  userId: string;
  created: boolean;
  linkedExisting: boolean;
  generatedPassword?: string;
  inviteRequested: boolean;
  inviteEmail: string;
  invitePurpose: PasswordResetEmailPurpose;
  applied: {
    orgAccess: UserAccessAssignmentDto[];
    buildingAccess: UserAccessAssignmentDto[];
    resident: UserResidentDto | null;
  };
};

@Injectable()
export class OrgUserLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly userAccessProjectionService: UserAccessProjectionService,
  ) {}

  async buildUserResponseById(
    userId: string,
    orgId: string | null,
  ): Promise<UserResponseDto> {
    return this.userAccessProjectionService.buildUserResponseById(
      userId,
      orgId,
    );
  }

  async buildUserResponse(
    user: {
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
    },
    orgId: string | null,
  ): Promise<UserResponseDto> {
    return this.userAccessProjectionService.buildUserResponse(user, orgId);
  }

  async listUserResponsesInOrg(orgId: string): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      users.map((user) => this.buildUserResponse(user, orgId)),
    );
  }

  async buildUserResponseInOrg(
    userId: string,
    orgId: string,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.orgId !== orgId) {
      throw new NotFoundException('User not found');
    }
    return this.buildUserResponse(user, orgId);
  }

  async provisionOrgUser(params: OrgUserProvisionParams): Promise<
    ProvisionMutationResult & {
      user: UserResponseDto;
    }
  > {
    const actorId = params.actor?.sub;
    const orgId = params.orgId;
    const normalizedEmail = normalizeEmail(params.identity.email);
    const mode = params.mode ?? {};
    const ifEmailExists = mode.ifEmailExists ?? 'LINK';
    const requireSameOrg = mode.requireSameOrg ?? true;
    const invitePurpose =
      params.invitePurpose ??
      (params.resident && (params.resident.mode ?? 'ADD') !== 'MOVE_OUT'
        ? 'RESIDENT_INVITE'
        : 'PASSWORD_RESET');

    const accessAssignments = this.dedupeAssignments(
      params.accessAssignments ?? [],
    );
    const shouldEnsureResidentPermissions =
      params.ensureResidentBaselinePermissions === true ||
      Boolean(params.resident);

    const mutation = await this.prisma.$transaction(async (tx) => {
      let created = false;
      let linkedExisting = false;
      let generatedPassword: string | undefined;

      let targetUser = await tx.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });

      if (targetUser) {
        if (ifEmailExists === 'ERROR') {
          throw new ConflictException(
            describeEmailOwnershipConflict({
              existingOrgId: targetUser.orgId,
              targetOrgId: orgId,
            }),
          );
        }

        if (targetUser.orgId !== orgId) {
          if (!targetUser.orgId && !requireSameOrg) {
            targetUser = await tx.user.update({
              where: { id: targetUser.id },
              data: { orgId },
            });
          } else {
            throw new BadRequestException('User not in org');
          }
        }

        if (!targetUser.orgId) {
          throw new BadRequestException('User not in org');
        }

        if (!targetUser.isActive) {
          throw new BadRequestException('User not active');
        }

        linkedExisting = true;
      } else {
        const name = params.identity.name?.trim();
        const sendInvite = params.identity.sendInvite === true;
        if (!name || name.length < 2) {
          throw new BadRequestException('Name required');
        }

        if (
          !params.identity.password &&
          !sendInvite &&
          !params.allowGeneratedPasswordWithoutInvite
        ) {
          throw new BadRequestException('Password or sendInvite required');
        }

        const password =
          params.identity.password ?? this.generateTempPassword();
        const passwordHash = await argon2.hash(password);

        targetUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            phone: params.identity.phone?.trim() ?? null,
            passwordHash,
            orgId,
            mustChangePassword: true,
          },
        });

        created = true;
        generatedPassword = params.identity.password ? undefined : password;
      }

      if (shouldEnsureResidentPermissions) {
        await this.ensureResidentPermissions(tx, targetUser.id);
      }

      const appliedAssignments = await this.applyAccessAssignments(
        tx,
        orgId,
        targetUser.id,
        accessAssignments,
      );
      const appliedResident = await this.applyResidentGrant(
        tx,
        orgId,
        targetUser.id,
        params.resident,
      );

      return {
        userId: targetUser.id,
        created,
        linkedExisting,
        generatedPassword,
        inviteRequested: params.identity.sendInvite === true,
        inviteEmail: targetUser.email,
        invitePurpose,
        applied: {
          orgAccess: appliedAssignments.filter(
            (assignment) => assignment.scopeType === AccessScopeType.ORG,
          ),
          buildingAccess: appliedAssignments.filter(
            (assignment) => assignment.scopeType === AccessScopeType.BUILDING,
          ),
          resident: appliedResident,
        },
      };
    });

    if (mutation.inviteRequested) {
      await this.authService.requestPasswordReset(mutation.inviteEmail, {
        purpose: mutation.invitePurpose,
        issuedByUserId: actorId ?? null,
      });
    }

    const user = await this.buildUserResponseInOrg(mutation.userId, orgId);
    return {
      ...mutation,
      user,
    };
  }

  private async applyAccessAssignments(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    assignments: ProvisionAccessAssignmentDto[],
  ): Promise<UserAccessAssignmentDto[]> {
    const applied: UserAccessAssignmentDto[] = [];

    for (const grant of assignments) {
      const roleTemplate = await this.findRoleTemplateForProvisioning(
        tx,
        orgId,
        grant,
      );

      const scopeId =
        grant.scopeType === AccessScopeType.ORG
          ? null
          : (grant.scopeId ?? null);

      if (roleTemplate.scopeType !== grant.scopeType) {
        throw new BadRequestException(
          'Assignment scopeType must match the role template scopeType',
        );
      }

      if (grant.scopeType === AccessScopeType.ORG) {
        if (scopeId !== null) {
          throw new BadRequestException(
            'ORG assignments must use scopeId null',
          );
        }
      } else {
        if (!scopeId) {
          throw new BadRequestException(
            'BUILDING assignments require a building scopeId',
          );
        }

        const building = await tx.building.findFirst({
          where: { id: scopeId, orgId },
          select: { id: true },
        });
        if (!building) {
          throw new NotFoundException('Building not found');
        }
      }

      const duplicate = await tx.userAccessAssignment.findFirst({
        where: {
          userId,
          roleTemplateId: roleTemplate.id,
          scopeType: grant.scopeType,
          scopeId,
        },
        select: { id: true },
      });

      const assignment =
        duplicate ??
        (await tx.userAccessAssignment.upsert({
          where: {
            id: buildUserAccessAssignmentId({
              userId,
              roleTemplateId: roleTemplate.id,
              scopeType: grant.scopeType,
              scopeId,
            }),
          },
          update: {},
          create: {
            id: buildUserAccessAssignmentId({
              userId,
              roleTemplateId: roleTemplate.id,
              scopeType: grant.scopeType,
              scopeId,
            }),
            userId,
            roleTemplateId: roleTemplate.id,
            scopeType: grant.scopeType,
            scopeId,
          },
          select: { id: true },
        }));

      applied.push({
        assignmentId: assignment.id,
        roleTemplateKey: roleTemplate.key,
        scopeType: grant.scopeType,
        scopeId,
      });
    }

    return applied.sort((left, right) => {
      if (left.scopeType !== right.scopeType) {
        return left.scopeType.localeCompare(right.scopeType);
      }
      if ((left.scopeId ?? '') !== (right.scopeId ?? '')) {
        return (left.scopeId ?? '').localeCompare(right.scopeId ?? '');
      }
      return left.roleTemplateKey.localeCompare(right.roleTemplateKey);
    });
  }

  private async findRoleTemplateForProvisioning(
    tx: Prisma.TransactionClient,
    orgId: string,
    grant: ProvisionAccessAssignmentDto,
  ) {
    const selectors = [
      grant.roleTemplateId ? { id: grant.roleTemplateId } : null,
      grant.roleTemplateKey ? { key: grant.roleTemplateKey } : null,
    ].filter(Boolean) as Array<{ id?: string; key?: string }>;

    if (selectors.length === 0) {
      throw new BadRequestException(
        'Each access assignment requires roleTemplateId or roleTemplateKey',
      );
    }

    const roleTemplate = await tx.roleTemplate.findFirst({
      where: {
        orgId,
        OR: selectors,
      },
    });

    if (!roleTemplate || !isVisibleRoleTemplate(roleTemplate)) {
      throw new BadRequestException('Role template not found');
    }

    return roleTemplate;
  }

  private async applyResidentGrant(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    residentGrant?: ResidentGrantDto,
  ): Promise<UserResidentDto | null> {
    if (!residentGrant) {
      return null;
    }

    const building = await tx.building.findFirst({
      where: { id: residentGrant.buildingId, orgId },
    });
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const mode = residentGrant.mode ?? 'ADD';
    if (mode === 'MOVE_OUT') {
      await tx.occupancy.updateMany({
        where: {
          residentUserId: userId,
          buildingId: residentGrant.buildingId,
          status: 'ACTIVE',
        },
        data: {
          status: 'ENDED',
          endAt: new Date(),
        },
      });
      return null;
    }

    if (!residentGrant.unitId) {
      throw new BadRequestException('Unit required');
    }

    const unit = await tx.unit.findFirst({
      where: { id: residentGrant.unitId, buildingId: residentGrant.buildingId },
    });
    if (!unit) {
      throw new BadRequestException('Unit not in building');
    }

    await this.lockUnit(tx, unit.id);

    const existingForUnit = await tx.occupancy.findFirst({
      where: { unitId: unit.id, status: 'ACTIVE' },
    });

    if (existingForUnit && existingForUnit.residentUserId !== userId) {
      throw new ConflictException('Unit is already occupied');
    }

    const existingForUserUnit =
      existingForUnit && existingForUnit.residentUserId === userId
        ? existingForUnit
        : await tx.occupancy.findFirst({
            where: {
              unitId: unit.id,
              residentUserId: userId,
              status: 'ACTIVE',
            },
          });

    if (mode === 'ADD') {
      const existingForResident = await tx.occupancy.findFirst({
        where: {
          residentUserId: userId,
          status: 'ACTIVE',
        },
      });
      if (existingForResident && existingForResident.unitId !== unit.id) {
        throw new ConflictException('Resident already occupying a unit');
      }
    }

    if (mode === 'MOVE') {
      await tx.occupancy.updateMany({
        where: {
          residentUserId: userId,
          buildingId: residentGrant.buildingId,
          status: 'ACTIVE',
          unitId: { not: unit.id },
        },
        data: {
          status: 'ENDED',
          endAt: new Date(),
        },
      });
    }

    let occupancy = existingForUserUnit ?? null;
    if (!occupancy) {
      try {
        occupancy = await tx.occupancy.create({
          data: {
            buildingId: residentGrant.buildingId,
            unitId: unit.id,
            residentUserId: userId,
            status: 'ACTIVE',
            endAt: null,
          },
        });
      } catch (error: unknown) {
        const mapped = mapOccupancyConstraintError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }
    }

    return {
      occupancyId: occupancy.id,
      unitId: occupancy.unitId,
      buildingId: occupancy.buildingId,
    };
  }

  private dedupeAssignments(assignments: ProvisionAccessAssignmentDto[]) {
    const seen = new Set<string>();
    const deduped: ProvisionAccessAssignmentDto[] = [];

    for (const assignment of assignments) {
      const selector = assignment.roleTemplateId ?? assignment.roleTemplateKey;
      const key = [
        selector,
        assignment.scopeType,
        assignment.scopeId ?? '',
      ].join(':');

      if (!selector || seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push({
        ...assignment,
        scopeId:
          assignment.scopeType === AccessScopeType.ORG
            ? null
            : (assignment.scopeId ?? null),
      });
    }

    return deduped;
  }

  private async ensureResidentPermissions(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const permissions = await tx.permission.findMany({
      where: {
        key: { in: [...RESIDENT_BASELINE_PERMISSION_KEYS] },
      },
      select: { id: true },
    });

    if (permissions.length === 0) {
      return;
    }

    await tx.userPermission.createMany({
      data: permissions.map((permission) => ({
        userId,
        permissionId: permission.id,
        effect: PermissionEffect.ALLOW,
      })),
      skipDuplicates: true,
    });
  }

  private generateTempPassword() {
    return randomBytes(12).toString('base64url');
  }

  private async lockUnit(tx: Prisma.TransactionClient, unitId: string) {
    await tx.$executeRaw`SELECT id FROM "Unit" WHERE id = ${unitId} FOR UPDATE`;
  }
}

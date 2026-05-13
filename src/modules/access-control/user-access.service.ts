import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessScopeType, PermissionEffect } from '@prisma/client';
import { AccessControlRepo } from './access-control.repo';
import { AccessControlService } from './access-control.service';
import {
  AccessAssignmentResponseDto,
  CreateAccessAssignmentDto,
  toAccessAssignmentResponse,
} from './dto/access-assignment.dto';
import { listPlatformPermissionKeys } from './permission-keys';
import { isVisibleRoleTemplate } from './role-defaults';

@Injectable()
export class UserAccessService {
  constructor(
    private readonly accessControlRepo: AccessControlRepo,
    private readonly accessControlService: AccessControlService,
  ) {}

  async listAccessAssignments(
    userId: string,
    orgId: string,
  ): Promise<AccessAssignmentResponseDto[]> {
    await this.assertUserInOrg(userId, orgId);

    const assignments = await this.accessControlRepo.listUserAccessAssignments(
      userId,
      orgId,
    );
    return assignments
      .filter((assignment) => isVisibleRoleTemplate(assignment.roleTemplate))
      .map(toAccessAssignmentResponse);
  }

  async createAccessAssignment(
    userId: string,
    orgId: string,
    dto: CreateAccessAssignmentDto,
  ): Promise<AccessAssignmentResponseDto> {
    await this.assertUserInOrg(userId, orgId);

    const roleTemplate = await this.accessControlRepo.findRoleTemplateById(
      orgId,
      dto.roleTemplateId,
    );
    if (!roleTemplate || !isVisibleRoleTemplate(roleTemplate)) {
      throw new BadRequestException('Role template not found');
    }

    const scopeId =
      dto.scopeType === AccessScopeType.ORG ? null : (dto.scopeId ?? null);

    if (roleTemplate.scopeType !== dto.scopeType) {
      throw new BadRequestException(
        'Assignment scopeType must match the role template scopeType',
      );
    }

    if (dto.scopeType === AccessScopeType.ORG && scopeId !== null) {
      throw new BadRequestException('ORG assignments must use scopeId null');
    }

    if (dto.scopeType === AccessScopeType.BUILDING) {
      if (!scopeId) {
        throw new BadRequestException(
          'BUILDING assignments require a building scopeId',
        );
      }

      const building = await this.accessControlRepo.findBuildingByIdForOrg(
        scopeId,
        orgId,
      );
      if (!building) {
        throw new NotFoundException('Building not found');
      }
    }

    const duplicate =
      await this.accessControlRepo.findDuplicateUserAccessAssignment(
        userId,
        dto.roleTemplateId,
        dto.scopeType,
        scopeId,
      );
    if (duplicate) {
      throw new ConflictException('Access assignment already exists');
    }

    const assignment = await this.accessControlRepo.createUserAccessAssignment({
      userId,
      roleTemplateId: dto.roleTemplateId,
      scopeType: dto.scopeType,
      scopeId,
    });

    const created = await this.accessControlRepo.findUserAccessAssignmentById(
      assignment.id,
      orgId,
    );
    if (!created) {
      throw new NotFoundException('Access assignment not found');
    }

    return toAccessAssignmentResponse(created);
  }

  async deleteAccessAssignment(
    userId: string,
    orgId: string,
    assignmentId: string,
  ) {
    await this.assertUserInOrg(userId, orgId);

    const assignment =
      await this.accessControlRepo.findUserAccessAssignmentById(
        assignmentId,
        orgId,
      );
    if (!assignment || assignment.userId !== userId) {
      throw new NotFoundException('Access assignment not found');
    }

    await this.accessControlRepo.deleteUserAccessAssignment(assignmentId);
  }

  async setPermissionOverrides(
    userId: string,
    overrides: { permissionKey: string; effect: PermissionEffect }[],
    orgId: string,
  ) {
    await this.assertUserInOrg(userId, orgId);
    const permissionKeys = overrides.map((override) => override.permissionKey);
    const disallowedPlatformKeys = listPlatformPermissionKeys(permissionKeys);
    if (disallowedPlatformKeys.length > 0) {
      throw new BadRequestException(
        `Platform permission keys cannot be assigned to org users: ${disallowedPlatformKeys.join(', ')}`,
      );
    }

    const permissions =
      await this.accessControlRepo.findPermissionsByKeys(permissionKeys);
    const missing = permissionKeys.filter(
      (key) => !permissions.find((permission) => permission.key === key),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown permission keys: ${missing.join(', ')}`,
      );
    }

    const permissionIdByKey = new Map(
      permissions.map((permission) => [permission.key, permission.id]),
    );
    const mappedOverrides = overrides
      .map((override) => ({
        permissionId: permissionIdByKey.get(override.permissionKey),
        effect: override.effect,
      }))
      .filter(
        (
          override,
        ): override is { permissionId: string; effect: PermissionEffect } =>
          Boolean(override.permissionId),
      );

    await this.accessControlRepo.replaceUserPermissions(
      userId,
      mappedOverrides,
    );
  }

  async getPermissionOverrides(userId: string, orgId: string) {
    await this.assertUserInOrg(userId, orgId);
    const { userOverrides } = await this.accessControlRepo.getUserScopedAccess(
      userId,
      { orgId },
    );
    return userOverrides.map((override) => ({
      permissionKey: override.key,
      effect: override.effect,
    }));
  }

  async getEffectivePermissions(
    userId: string,
    orgId: string,
    buildingId?: string,
  ) {
    await this.assertUserInOrg(userId, orgId);
    const effective =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
        buildingId,
      });
    return Array.from(effective).sort();
  }

  async getEffectivePermissionsForUsers(userIds: string[], orgId: string) {
    const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
    const entries = await Promise.all(
      uniqueIds.map(async (userId) => ({
        userId,
        permissions: await this.getEffectivePermissions(userId, orgId),
      })),
    );
    return entries;
  }

  private async assertUserInOrg(userId: string, orgId: string) {
    const user = await this.accessControlRepo.findUserById(userId);
    if (!user || user.orgId !== orgId) {
      throw new BadRequestException('User not in org');
    }
  }
}

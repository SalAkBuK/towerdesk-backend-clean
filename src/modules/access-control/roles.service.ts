import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessControlRepo } from './access-control.repo';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleResponseDto, toRoleResponse } from './dto/role.response.dto';
import { UpdateRoleTemplateDto } from './dto/update-role-template.dto';
import {
  isReservedRoleTemplateKey,
  isVisibleRoleTemplate,
} from './role-defaults';
import { listPlatformPermissionKeys } from './permission-keys';

@Injectable()
export class RolesService {
  constructor(private readonly accessControlRepo: AccessControlRepo) {}

  async list(orgId: string): Promise<RoleResponseDto[]> {
    const roleTemplates =
      await this.accessControlRepo.listRoleTemplatesWithPermissions(orgId);

    return roleTemplates
      .filter((roleTemplate) => isVisibleRoleTemplate(roleTemplate))
      .map(toRoleResponse);
  }

  async getById(
    orgId: string,
    roleTemplateId: string,
  ): Promise<RoleResponseDto> {
    const roleTemplate =
      await this.accessControlRepo.findRoleTemplateWithPermissionsById(
        orgId,
        roleTemplateId,
      );
    if (!roleTemplate || !isVisibleRoleTemplate(roleTemplate)) {
      throw new NotFoundException('Role template not found');
    }

    return toRoleResponse(roleTemplate);
  }

  async create(
    actorUserId: string,
    orgId: string,
    dto: CreateRoleDto,
  ): Promise<RoleResponseDto> {
    await this.assertOrgAdmin(actorUserId, orgId);

    const normalizedKey = dto.key.trim();
    if (isReservedRoleTemplateKey(normalizedKey)) {
      throw new BadRequestException('Role template key is reserved');
    }

    const permissionIds = await this.resolvePermissionIds(dto.permissionKeys);

    try {
      const roleTemplate = await this.accessControlRepo.createRoleTemplate({
        org: { connect: { id: orgId } },
        key: normalizedKey,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        isSystem: false,
        scopeType: dto.scopeType,
      });

      await this.accessControlRepo.replaceRoleTemplatePermissions(
        roleTemplate.id,
        permissionIds,
      );

      return this.getById(orgId, roleTemplate.id);
    } catch (error: unknown) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('Role template key already exists');
      }
      throw error;
    }
  }

  async update(
    actorUserId: string,
    orgId: string,
    roleTemplateId: string,
    dto: UpdateRoleTemplateDto,
  ): Promise<RoleResponseDto> {
    await this.assertOrgAdmin(actorUserId, orgId);

    const existing = await this.accessControlRepo.findRoleTemplateById(
      orgId,
      roleTemplateId,
    );
    if (!existing || !isVisibleRoleTemplate(existing)) {
      throw new NotFoundException('Role template not found');
    }
    if (existing.isSystem) {
      throw new BadRequestException('System role templates cannot be edited');
    }

    if (dto.name !== undefined || dto.description !== undefined) {
      await this.accessControlRepo.updateRoleTemplate(roleTemplateId, {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
      });
    }

    if (dto.permissionKeys) {
      const permissionIds = await this.resolvePermissionIds(dto.permissionKeys);
      await this.accessControlRepo.replaceRoleTemplatePermissions(
        roleTemplateId,
        permissionIds,
      );
    }

    return this.getById(orgId, roleTemplateId);
  }

  async delete(actorUserId: string, orgId: string, roleTemplateId: string) {
    await this.assertOrgAdmin(actorUserId, orgId);

    const roleTemplate = await this.accessControlRepo.findRoleTemplateById(
      orgId,
      roleTemplateId,
    );
    if (!roleTemplate || !isVisibleRoleTemplate(roleTemplate)) {
      throw new NotFoundException('Role template not found');
    }
    if (roleTemplate.isSystem) {
      throw new BadRequestException('System role templates cannot be deleted');
    }

    const assignedUsers =
      await this.accessControlRepo.countUsersAssignedToRoleTemplate(
        roleTemplateId,
      );
    if (assignedUsers > 0) {
      throw new ConflictException(
        'Role template is assigned and cannot be deleted',
      );
    }

    await this.accessControlRepo.deleteRoleTemplate(roleTemplateId);
  }

  private async resolvePermissionIds(permissionKeys: string[]) {
    const normalizedKeys = Array.from(
      new Set(permissionKeys.map((key) => key.trim()).filter(Boolean)),
    );
    const disallowedPlatformKeys = listPlatformPermissionKeys(normalizedKeys);
    if (disallowedPlatformKeys.length > 0) {
      throw new BadRequestException(
        `Platform permission keys cannot be assigned to org role templates: ${disallowedPlatformKeys.join(', ')}`,
      );
    }

    const permissions =
      await this.accessControlRepo.findPermissionsByKeys(normalizedKeys);
    const permissionIds = permissions.map((permission) => permission.id);
    const missing = normalizedKeys.filter(
      (key) => !permissions.find((permission) => permission.key === key),
    );

    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown permission keys: ${missing.join(', ')}`,
      );
    }

    return permissionIds;
  }

  private async assertOrgAdmin(userId: string, orgId: string) {
    const isOrgAdmin = await this.accessControlRepo.hasUserRoleTemplateKeyInOrg(
      userId,
      orgId,
      'org_admin',
    );

    if (!isOrgAdmin) {
      throw new ForbiddenException('Only org_admin can manage role templates');
    }
  }

  private isUniqueConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return true;
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    ) {
      return true;
    }

    if (error instanceof Error) {
      return error.message.toLowerCase().includes('unique constraint');
    }

    return false;
  }
}

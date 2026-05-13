import { Injectable } from '@nestjs/common';
import { AccessScopeType, PermissionEffect, Prisma } from '@prisma/client';
import { DbClient } from '../../infra/prisma/db-client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { buildUserAccessAssignmentId } from './access-assignment-id.util';
import { isVisibleRoleTemplate } from './role-defaults';

export interface UserPermissionOverride {
  key: string;
  effect: PermissionEffect;
}

type ScopedAccessContext = {
  orgId: string | null;
  buildingId?: string;
  includeHiddenRoleTemplates?: boolean;
};

@Injectable()
export class AccessControlRepo {
  constructor(private readonly prisma: PrismaService) {}

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  listRoleTemplatesWithPermissions(orgId: string) {
    return this.prisma.roleTemplate.findMany({
      where: { orgId },
      orderBy: [{ scopeType: 'asc' }, { key: 'asc' }],
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  findRoleTemplateWithPermissionsById(orgId: string, roleTemplateId: string) {
    return this.prisma.roleTemplate.findFirst({
      where: { id: roleTemplateId, orgId },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  findRoleTemplateById(orgId: string, roleTemplateId: string) {
    return this.prisma.roleTemplate.findFirst({
      where: { id: roleTemplateId, orgId },
    });
  }

  createRoleTemplate(data: Prisma.RoleTemplateCreateInput) {
    return this.prisma.roleTemplate.create({ data });
  }

  updateRoleTemplate(
    roleTemplateId: string,
    data: Prisma.RoleTemplateUpdateInput,
  ) {
    return this.prisma.roleTemplate.update({
      where: { id: roleTemplateId },
      data,
    });
  }

  deleteRoleTemplate(roleTemplateId: string) {
    return this.prisma.roleTemplate.delete({ where: { id: roleTemplateId } });
  }

  findPermissionsByKeys(keys: string[]) {
    if (keys.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });
  }

  findRoleTemplatesByIds(ids: string[], orgId: string, db?: DbClient) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    const prisma = db ?? this.prisma;
    return prisma.roleTemplate.findMany({
      where: { id: { in: ids }, orgId },
    });
  }

  findRoleTemplatesByKeys(keys: string[], orgId: string, db?: DbClient) {
    if (keys.length === 0) {
      return Promise.resolve([]);
    }

    const prisma = db ?? this.prisma;
    return prisma.roleTemplate.findMany({
      where: { key: { in: keys }, orgId },
    });
  }

  async replaceRoleTemplatePermissions(
    roleTemplateId: string,
    permissionIds: string[],
  ) {
    await this.prisma.$transaction([
      this.prisma.roleTemplatePermission.deleteMany({
        where: { roleTemplateId },
      }),
      ...(permissionIds.length === 0
        ? []
        : [
            this.prisma.roleTemplatePermission.createMany({
              data: permissionIds.map((permissionId) => ({
                roleTemplateId,
                permissionId,
              })),
              skipDuplicates: true,
            }),
          ]),
    ]);
  }

  async replaceUserPermissions(
    userId: string,
    overrides: { permissionId: string; effect: PermissionEffect }[],
  ) {
    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId } }),
      ...(overrides.length === 0
        ? []
        : [
            this.prisma.userPermission.createMany({
              data: overrides.map((override) => ({
                userId,
                permissionId: override.permissionId,
                effect: override.effect,
              })),
              skipDuplicates: true,
            }),
          ]),
    ]);
  }

  async getUserScopedAccess(userId: string, context: ScopedAccessContext) {
    const assignmentWhere: Prisma.UserAccessAssignmentWhereInput = {
      userId,
      roleTemplate: { orgId: context.orgId },
      ...(context.buildingId
        ? {
            OR: [
              {
                scopeType: AccessScopeType.ORG,
                scopeId: null,
                roleTemplate: { scopeType: AccessScopeType.ORG },
              },
              {
                scopeType: AccessScopeType.BUILDING,
                scopeId: context.buildingId,
                roleTemplate: { scopeType: AccessScopeType.BUILDING },
              },
            ],
          }
        : {
            scopeType: AccessScopeType.ORG,
            scopeId: null,
            roleTemplate: { scopeType: AccessScopeType.ORG },
          }),
    };

    const [assignments, overrides] = await this.prisma.$transaction([
      this.prisma.userAccessAssignment.findMany({
        where: assignmentWhere,
        include: {
          roleTemplate: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.userPermission.findMany({
        where: { userId },
        include: {
          permission: true,
        },
      }),
    ]);

    const visibleAssignments = this.filterVisibleAssignments(
      assignments,
      context.includeHiddenRoleTemplates,
    );

    const rolePermissionKeys = visibleAssignments.flatMap((assignment) =>
      assignment.roleTemplate.rolePermissions.map(
        (rolePermission) => rolePermission.permission.key,
      ),
    );

    const userOverrides: UserPermissionOverride[] = overrides.map(
      (override) => ({
        key: override.permission.key,
        effect: override.effect,
      }),
    );

    return {
      assignments: visibleAssignments,
      rolePermissionKeys,
      userOverrides,
    };
  }

  async getUserAccessAcrossAnyScope(userId: string, orgId: string | null) {
    const [assignments, overrides] = await this.prisma.$transaction([
      this.prisma.userAccessAssignment.findMany({
        where: {
          userId,
          roleTemplate: { orgId },
        },
        include: {
          roleTemplate: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.userPermission.findMany({
        where: { userId },
        include: {
          permission: true,
        },
      }),
    ]);

    const visibleAssignments = this.filterVisibleAssignments(assignments);

    const rolePermissionKeys = visibleAssignments.flatMap((assignment) =>
      assignment.roleTemplate.rolePermissions.map(
        (rolePermission) => rolePermission.permission.key,
      ),
    );

    const userOverrides: UserPermissionOverride[] = overrides.map(
      (override) => ({
        key: override.permission.key,
        effect: override.effect,
      }),
    );

    return {
      assignments: visibleAssignments,
      rolePermissionKeys,
      userOverrides,
    };
  }

  listUserAccessAssignments(userId: string, orgId: string, db?: DbClient) {
    const prisma = db ?? this.prisma;
    return prisma.userAccessAssignment.findMany({
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
    });
  }

  listBuildingAccessAssignments(
    buildingId: string,
    orgId: string,
    db?: DbClient,
  ) {
    const prisma = db ?? this.prisma;
    return prisma.userAccessAssignment.findMany({
      where: {
        scopeType: AccessScopeType.BUILDING,
        scopeId: buildingId,
        roleTemplate: {
          orgId,
          scopeType: AccessScopeType.BUILDING,
        },
      },
      include: {
        roleTemplate: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            phone: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  createUserAccessAssignment(
    data: Prisma.UserAccessAssignmentUncheckedCreateInput,
    db?: DbClient,
  ) {
    const prisma = db ?? this.prisma;
    const id =
      data.id ??
      buildUserAccessAssignmentId({
        userId: data.userId,
        roleTemplateId: data.roleTemplateId,
        scopeType: data.scopeType as AccessScopeType,
        scopeId: data.scopeId ?? null,
      });

    return prisma.userAccessAssignment.upsert({
      where: { id },
      update: {},
      create: {
        ...data,
        id,
      },
    });
  }

  findUserAccessAssignmentById(
    assignmentId: string,
    orgId: string,
    db?: DbClient,
  ) {
    const prisma = db ?? this.prisma;
    return prisma.userAccessAssignment.findFirst({
      where: {
        id: assignmentId,
        roleTemplate: { orgId },
      },
      include: {
        roleTemplate: true,
      },
    });
  }

  deleteUserAccessAssignment(assignmentId: string, db?: DbClient) {
    const prisma = db ?? this.prisma;
    return prisma.userAccessAssignment.delete({
      where: { id: assignmentId },
    });
  }

  findDuplicateUserAccessAssignment(
    userId: string,
    roleTemplateId: string,
    scopeType: AccessScopeType,
    scopeId: string | null,
    db?: DbClient,
  ) {
    const prisma = db ?? this.prisma;
    return prisma.userAccessAssignment.findFirst({
      where: {
        userId,
        roleTemplateId,
        scopeType,
        scopeId,
      },
      select: { id: true },
    });
  }

  findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, orgId: true },
    });
  }

  findBuildingByIdForOrg(buildingId: string, orgId: string, db?: DbClient) {
    const prisma = db ?? this.prisma;
    return prisma.building.findFirst({
      where: { id: buildingId, orgId },
      select: { id: true },
    });
  }

  hasUserRoleTemplateKeyInOrg(
    userId: string,
    orgId: string | null,
    roleTemplateKey: string,
  ) {
    return this.prisma.userAccessAssignment.findFirst({
      where: {
        userId,
        scopeType: AccessScopeType.ORG,
        scopeId: null,
        roleTemplate: {
          orgId,
          key: roleTemplateKey,
          scopeType: AccessScopeType.ORG,
        },
      },
      select: { id: true },
    });
  }

  countUsersAssignedToRoleTemplate(roleTemplateId: string) {
    return this.prisma.userAccessAssignment.count({
      where: { roleTemplateId },
    });
  }

  private filterVisibleAssignments<
    T extends { roleTemplate: { key: string; isSystem?: boolean | null } },
  >(assignments: T[], includeHiddenRoleTemplates = false) {
    if (includeHiddenRoleTemplates) {
      return assignments;
    }

    return assignments.filter((assignment) =>
      isVisibleRoleTemplate(assignment.roleTemplate),
    );
  }
}

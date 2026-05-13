import { Injectable } from '@nestjs/common';
import { PermissionEffect } from '@prisma/client';
import { AccessControlRepo } from './access-control.repo';

export interface PermissionContext {
  orgId?: string | null;
  buildingId?: string;
  includeHiddenRoleTemplates?: boolean;
}

@Injectable()
export class AccessControlService {
  constructor(private readonly accessControlRepo: AccessControlRepo) {}

  async getUserEffectivePermissions(
    userId: string,
    context?: PermissionContext,
  ): Promise<Set<string>> {
    const orgId = context?.orgId ?? null;
    const { rolePermissionKeys, userOverrides } =
      await this.accessControlRepo.getUserScopedAccess(userId, {
        orgId,
        buildingId: context?.buildingId,
        includeHiddenRoleTemplates: context?.includeHiddenRoleTemplates,
      });

    const effective = new Set(rolePermissionKeys);

    for (const override of userOverrides) {
      if (override.effect === PermissionEffect.ALLOW) {
        effective.add(override.key);
      } else {
        effective.delete(override.key);
      }
    }

    return effective;
  }

  async getUserEffectivePermissionsAcrossAnyScope(
    userId: string,
    context?: Pick<PermissionContext, 'orgId'>,
  ): Promise<Set<string>> {
    const orgId = context?.orgId ?? null;
    const { rolePermissionKeys, userOverrides } =
      await this.accessControlRepo.getUserAccessAcrossAnyScope(userId, orgId);

    const effective = new Set(rolePermissionKeys);

    for (const override of userOverrides) {
      if (override.effect === PermissionEffect.ALLOW) {
        effective.add(override.key);
      } else {
        effective.delete(override.key);
      }
    }

    return effective;
  }

  async getUserScopedAssignments(userId: string, context?: PermissionContext) {
    return this.accessControlRepo.getUserScopedAccess(userId, {
      orgId: context?.orgId ?? null,
      buildingId: context?.buildingId,
      includeHiddenRoleTemplates: context?.includeHiddenRoleTemplates,
    });
  }
}

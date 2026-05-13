import { AccessScopeType, Permission, RoleTemplate } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class RoleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  description?: string | null;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty({ enum: AccessScopeType })
  scopeType!: AccessScopeType;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

type RoleTemplateWithPermissions = RoleTemplate & {
  rolePermissions: { permission: Permission }[];
};

export const toRoleResponse = (
  roleTemplate: RoleTemplateWithPermissions,
): RoleResponseDto => ({
  id: roleTemplate.id,
  key: roleTemplate.key,
  name: roleTemplate.name,
  description: roleTemplate.description ?? null,
  isSystem: roleTemplate.isSystem,
  scopeType: roleTemplate.scopeType,
  createdAt: roleTemplate.createdAt,
  updatedAt: roleTemplate.updatedAt,
  permissions: roleTemplate.rolePermissions
    .map((rolePermission) => rolePermission.permission.key)
    .sort((left, right) => left.localeCompare(right)),
});

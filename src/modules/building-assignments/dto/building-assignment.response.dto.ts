import { AccessScopeType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const legacyBuildingAssignmentTypeByRoleTemplateKey = {
  building_manager: 'MANAGER',
  building_staff: 'STAFF',
  building_admin: 'BUILDING_ADMIN',
} as const;

type LegacyBuildingAssignmentType =
  (typeof legacyBuildingAssignmentTypeByRoleTemplateKey)[keyof typeof legacyBuildingAssignmentTypeByRoleTemplateKey];

export class BuildingAssignmentUserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiProperty()
  isActive!: boolean;
}

export class BuildingAssignmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  assignmentId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  roleTemplateId!: string;

  @ApiProperty()
  roleTemplateKey!: string;

  @ApiProperty({ enum: AccessScopeType })
  scopeType!: AccessScopeType;

  @ApiPropertyOptional({ nullable: true })
  scopeId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['MANAGER', 'STAFF', 'BUILDING_ADMIN'],
    description:
      'Legacy compatibility field. Null for custom building-scoped role templates.',
  })
  type!: LegacyBuildingAssignmentType | null;

  @ApiProperty({ type: BuildingAssignmentUserSummaryDto })
  user!: BuildingAssignmentUserSummaryDto;
}

export const toBuildingAssignmentResponse = (assignment: {
  id: string;
  userId: string;
  roleTemplateId: string;
  scopeType: AccessScopeType;
  scopeId: string | null;
  roleTemplate: { key: string };
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    phone: string | null;
    isActive: boolean;
  };
}): BuildingAssignmentResponseDto => ({
  id: assignment.id,
  assignmentId: assignment.id,
  buildingId: assignment.scopeId ?? '',
  userId: assignment.userId,
  roleTemplateId: assignment.roleTemplateId,
  roleTemplateKey: assignment.roleTemplate.key,
  scopeType: assignment.scopeType,
  scopeId: assignment.scopeId,
  type:
    legacyBuildingAssignmentTypeByRoleTemplateKey[
      assignment.roleTemplate
        .key as keyof typeof legacyBuildingAssignmentTypeByRoleTemplateKey
    ] ?? null,
  user: {
    id: assignment.user.id,
    email: assignment.user.email,
    name: assignment.user.name ?? null,
    avatarUrl: assignment.user.avatarUrl ?? null,
    phone: assignment.user.phone ?? null,
    isActive: assignment.user.isActive,
  },
});

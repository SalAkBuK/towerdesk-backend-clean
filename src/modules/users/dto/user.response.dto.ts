import { AccessScopeType, ServiceProviderUserRole } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserAccessAssignmentDto {
  @ApiProperty()
  assignmentId!: string;

  @ApiProperty()
  roleTemplateKey!: string;

  @ApiProperty({ enum: AccessScopeType })
  scopeType!: AccessScopeType;

  @ApiProperty({ required: false, nullable: true })
  scopeId!: string | null;
}

export class UserResidentDto {
  @ApiProperty()
  occupancyId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiProperty()
  buildingId!: string;
}

export class UserPermissionOverrideDto {
  @ApiProperty()
  permissionKey!: string;

  @ApiProperty()
  effect!: string;
}

export const userPersonaValues = [
  'RESIDENT',
  'OWNER',
  'SERVICE_PROVIDER',
  'BUILDING_STAFF',
  'ORG_ADMIN',
  'PLATFORM_ADMIN',
] as const;

export type UserPersona = (typeof userPersonaValues)[number];

export const userResidentOccupancyStatusValues = [
  'ACTIVE',
  'NONE',
  'FORMER',
] as const;

export type UserResidentOccupancyStatus =
  (typeof userResidentOccupancyStatusValues)[number];

export const userResidentInviteStatusValues = [
  'PENDING',
  'ACCEPTED',
  'FAILED',
  'EXPIRED',
] as const;

export type UserResidentInviteStatus =
  (typeof userResidentInviteStatusValues)[number];

export class UserPersonaSummaryDto {
  @ApiProperty({ enum: userPersonaValues, isArray: true })
  keys!: UserPersona[];

  @ApiProperty()
  isResident!: boolean;

  @ApiPropertyOptional({
    enum: userResidentOccupancyStatusValues,
    nullable: true,
  })
  residentOccupancyStatus!: UserResidentOccupancyStatus | null;

  @ApiPropertyOptional({
    enum: userResidentInviteStatusValues,
    nullable: true,
  })
  residentInviteStatus!: UserResidentInviteStatus | null;

  @ApiProperty()
  isOwner!: boolean;

  @ApiProperty()
  isServiceProvider!: boolean;

  @ApiProperty({ enum: ServiceProviderUserRole, isArray: true })
  serviceProviderRoles!: ServiceProviderUserRole[];

  @ApiProperty()
  isBuildingStaff!: boolean;

  @ApiProperty({ type: [String] })
  buildingStaffRoleKeys!: string[];

  @ApiProperty()
  isOrgAdmin!: boolean;

  @ApiProperty()
  isPlatformAdmin!: boolean;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false, nullable: true })
  name?: string | null;

  @ApiProperty({ required: false, nullable: true })
  avatarUrl?: string | null;

  @ApiProperty({ required: false, nullable: true })
  phone?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ required: false, nullable: true })
  orgId?: string | null;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [UserAccessAssignmentDto] })
  orgAccess!: UserAccessAssignmentDto[];

  @ApiProperty({ type: [UserAccessAssignmentDto] })
  buildingAccess!: UserAccessAssignmentDto[];

  @ApiProperty({ required: false, nullable: true, type: UserResidentDto })
  resident!: UserResidentDto | null;

  @ApiProperty({ type: [String] })
  effectivePermissions!: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    type: [UserPermissionOverrideDto],
  })
  permissionOverrides?: UserPermissionOverrideDto[] | null;

  @ApiProperty({ type: UserPersonaSummaryDto })
  persona!: UserPersonaSummaryDto;
}

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

export const toUserResponse = (
  user: UserRecord,
  metadata: {
    orgAccess: UserAccessAssignmentDto[];
    buildingAccess: UserAccessAssignmentDto[];
    resident: UserResidentDto | null;
    effectivePermissions: string[];
    permissionOverrides?: UserPermissionOverrideDto[] | null;
    persona: UserPersonaSummaryDto;
  },
): UserResponseDto => ({
  id: user.id,
  email: user.email,
  name: user.name ?? null,
  avatarUrl: user.avatarUrl ?? null,
  phone: user.phone ?? null,
  isActive: user.isActive,
  orgId: user.orgId ?? null,
  mustChangePassword: user.mustChangePassword,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  orgAccess: metadata.orgAccess,
  buildingAccess: metadata.buildingAccess,
  resident: metadata.resident ?? null,
  effectivePermissions: metadata.effectivePermissions,
  permissionOverrides: metadata.permissionOverrides ?? null,
  persona: metadata.persona,
});

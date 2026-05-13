import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceProviderAccessGrantStatus } from '@prisma/client';
import { ServiceProviderOrgView } from '../service-providers.repo';

class ServiceProviderBuildingLinkResponseDto {
  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  buildingName!: string;

  @ApiProperty()
  createdAt!: Date;
}

class ServiceProviderAccessGrantUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;
}

export class ServiceProviderAccessGrantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ServiceProviderAccessGrantStatus })
  status!: ServiceProviderAccessGrantStatus;

  @ApiPropertyOptional({ nullable: true })
  inviteEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  invitedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  disabledAt?: Date | null;

  @ApiPropertyOptional({
    type: ServiceProviderAccessGrantUserDto,
    nullable: true,
  })
  user?: ServiceProviderAccessGrantUserDto | null;
}

export class ServiceProviderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  serviceCategory?: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isLinkedToCurrentOrg!: boolean;

  @ApiProperty()
  providerProfileOwnedByProvider!: boolean;

  @ApiProperty({ type: [ServiceProviderBuildingLinkResponseDto] })
  linkedBuildings!: ServiceProviderBuildingLinkResponseDto[];

  @ApiProperty({ type: [ServiceProviderAccessGrantResponseDto] })
  providerAdminAccessGrants!: ServiceProviderAccessGrantResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toServiceProviderAccessGrantResponse = (grant: {
  id: string;
  status: ServiceProviderAccessGrantStatus;
  inviteEmail?: string | null;
  invitedAt?: Date | null;
  acceptedAt?: Date | null;
  disabledAt?: Date | null;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    phone?: string | null;
    isActive: boolean;
    mustChangePassword: boolean;
  } | null;
}): ServiceProviderAccessGrantResponseDto => ({
  id: grant.id,
  status: grant.status,
  inviteEmail: grant.inviteEmail ?? null,
  invitedAt: grant.invitedAt ?? null,
  acceptedAt: grant.acceptedAt ?? null,
  disabledAt: grant.disabledAt ?? null,
  user: grant.user
    ? {
        id: grant.user.id,
        email: grant.user.email,
        name: grant.user.name ?? null,
        phone: grant.user.phone ?? null,
        isActive: grant.user.isActive,
        mustChangePassword: grant.user.mustChangePassword,
      }
    : null,
});

export const toServiceProviderResponse = (
  provider: ServiceProviderOrgView,
): ServiceProviderResponseDto => ({
  id: provider.id,
  name: provider.name,
  serviceCategory: provider.serviceCategory ?? null,
  contactName: provider.contactName ?? null,
  contactEmail: provider.contactEmail ?? null,
  contactPhone: provider.contactPhone ?? null,
  notes: provider.notes ?? null,
  isActive: provider.isActive,
  isLinkedToCurrentOrg: provider.buildings.length > 0,
  providerProfileOwnedByProvider: provider.accessGrants.some(
    (grant) => grant.status === ServiceProviderAccessGrantStatus.ACTIVE,
  ),
  linkedBuildings: provider.buildings.map((link) => ({
    buildingId: link.buildingId,
    buildingName: link.building.name,
    createdAt: link.createdAt,
  })),
  providerAdminAccessGrants: provider.accessGrants.map(
    toServiceProviderAccessGrantResponse,
  ),
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt,
});

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OwnerAccessGrant, OwnerAccessGrantStatus } from '@prisma/client';
import { OwnerAccessGrantUserDto } from './owner-access-grant-user.dto';

export class OwnerAccessGrantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  userId?: string | null;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ enum: OwnerAccessGrantStatus })
  status!: OwnerAccessGrantStatus;

  @ApiPropertyOptional({ nullable: true })
  inviteEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  invitedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  grantedByUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  disabledAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  disabledByUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  verificationMethod?: string | null;

  @ApiPropertyOptional({ type: OwnerAccessGrantUserDto, nullable: true })
  linkedUser?: OwnerAccessGrantUserDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toOwnerAccessGrantResponse = (
  grant: OwnerAccessGrant & {
    user?: {
      id: string;
      email: string;
      orgId: string | null;
      isActive: boolean;
      name?: string | null;
    } | null;
  },
): OwnerAccessGrantResponseDto => ({
  id: grant.id,
  userId: grant.userId ?? null,
  ownerId: grant.ownerId,
  status: grant.status,
  inviteEmail: grant.inviteEmail ?? null,
  invitedAt: grant.invitedAt ?? null,
  acceptedAt: grant.acceptedAt ?? null,
  grantedByUserId: grant.grantedByUserId ?? null,
  disabledAt: grant.disabledAt ?? null,
  disabledByUserId: grant.disabledByUserId ?? null,
  verificationMethod: grant.verificationMethod ?? null,
  linkedUser: grant.user
    ? {
        id: grant.user.id,
        email: grant.user.email,
        orgId: grant.user.orgId ?? null,
        isActive: grant.user.isActive,
        name: grant.user.name ?? null,
      }
    : null,
  createdAt: grant.createdAt,
  updatedAt: grant.updatedAt,
});

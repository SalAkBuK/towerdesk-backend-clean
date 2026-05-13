import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OwnerAccessGrantAuditAction,
  OwnerAccessGrantStatus,
} from '@prisma/client';

class OwnerAccessGrantAuditActorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;
}

export class OwnerAccessGrantAuditResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  grantId!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ enum: OwnerAccessGrantAuditAction })
  action!: OwnerAccessGrantAuditAction;

  @ApiPropertyOptional({ enum: OwnerAccessGrantStatus, nullable: true })
  fromStatus?: OwnerAccessGrantStatus | null;

  @ApiProperty({ enum: OwnerAccessGrantStatus })
  toStatus!: OwnerAccessGrantStatus;

  @ApiPropertyOptional({ nullable: true })
  actorUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  userId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  inviteEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  verificationMethod?: string | null;

  @ApiPropertyOptional({ type: OwnerAccessGrantAuditActorDto, nullable: true })
  actorUser?: OwnerAccessGrantAuditActorDto | null;

  @ApiProperty()
  createdAt!: Date;
}

export const toOwnerAccessGrantAuditResponse = (audit: {
  id: string;
  grantId: string;
  ownerId: string;
  action: OwnerAccessGrantAuditAction;
  fromStatus?: OwnerAccessGrantStatus | null;
  toStatus: OwnerAccessGrantStatus;
  actorUserId?: string | null;
  userId?: string | null;
  inviteEmail?: string | null;
  verificationMethod?: string | null;
  createdAt: Date;
  actorUser?: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
}): OwnerAccessGrantAuditResponseDto => ({
  id: audit.id,
  grantId: audit.grantId,
  ownerId: audit.ownerId,
  action: audit.action,
  fromStatus: audit.fromStatus ?? null,
  toStatus: audit.toStatus,
  actorUserId: audit.actorUserId ?? null,
  userId: audit.userId ?? null,
  inviteEmail: audit.inviteEmail ?? null,
  verificationMethod: audit.verificationMethod ?? null,
  actorUser: audit.actorUser
    ? {
        id: audit.actorUser.id,
        email: audit.actorUser.email,
        name: audit.actorUser.name ?? null,
      }
    : null,
  createdAt: audit.createdAt,
});

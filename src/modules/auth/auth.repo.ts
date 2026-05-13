import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AccessScopeType,
  NotificationType,
  OwnerAccessGrantAuditAction,
  OwnerAccessGrantStatus,
  Prisma,
  ResidentInviteStatus,
  ServiceProviderAccessGrantStatus,
  User,
} from '@prisma/client';
import { PasswordResetEmailPurpose } from './auth.types';

@Injectable()
export class AuthRepo {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  findByEmailInsensitive(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  updateRefreshTokenHash(id: string, refreshTokenHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { refreshTokenHash },
    });
  }

  async clearRefreshTokenHash(id: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id },
      data: { refreshTokenHash: null },
    });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });
  }

  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    purpose: PasswordResetEmailPurpose = 'PASSWORD_RESET',
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: { userId },
      });
      await tx.passwordResetToken.create({
        data: {
          userId,
          tokenHash,
          purpose,
          expiresAt,
        },
      });
    });
  }

  async createResidentInvite(params: {
    orgId: string;
    userId: string;
    createdByUserId?: string | null;
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.residentInvite.create({
      data: {
        orgId: params.orgId,
        userId: params.userId,
        createdByUserId: params.createdByUserId ?? null,
        email: params.email,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
        status: ResidentInviteStatus.SENT,
      },
    });
  }

  async markResidentInviteFailed(
    tokenHash: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.residentInvite.updateMany({
      where: {
        tokenHash,
        status: ResidentInviteStatus.SENT,
      },
      data: {
        status: ResidentInviteStatus.FAILED,
        failedAt: new Date(),
        failureReason: reason.slice(0, 1000),
      },
    });
  }

  async resetPasswordByToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      });

      if (
        !token ||
        token.usedAt ||
        token.expiresAt <= now ||
        !token.user.isActive
      ) {
        return false;
      }

      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          refreshTokenHash: null,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      });

      if (token.purpose === 'RESIDENT_INVITE') {
        await tx.residentInvite.updateMany({
          where: {
            tokenHash,
            status: ResidentInviteStatus.SENT,
          },
          data: {
            status: ResidentInviteStatus.ACCEPTED,
            acceptedAt: now,
            failedAt: null,
            failureReason: null,
          },
        });
      }

      const pendingOwnerGrants =
        token.purpose === 'OWNER_INVITE'
          ? await tx.ownerAccessGrant.findMany({
              where: {
                userId: token.userId,
                status: OwnerAccessGrantStatus.PENDING,
              },
              include: {
                owner: {
                  select: {
                    id: true,
                    orgId: true,
                    name: true,
                  },
                },
              },
            })
          : [];

      for (const grant of pendingOwnerGrants) {
        const updatedGrant = await tx.ownerAccessGrant.update({
          where: { id: grant.id },
          data: {
            status: OwnerAccessGrantStatus.ACTIVE,
            acceptedAt: now,
            invitedAt: null,
            inviteEmail: null,
            disabledAt: null,
            disabledByUserId: null,
            verificationMethod: grant.verificationMethod ?? 'OWNER_INVITE',
          },
        });

        await tx.ownerAccessGrantAudit.create({
          data: {
            grantId: updatedGrant.id,
            ownerId: updatedGrant.ownerId,
            actorUserId: null,
            action: OwnerAccessGrantAuditAction.ACTIVATED,
            fromStatus: OwnerAccessGrantStatus.PENDING,
            toStatus: OwnerAccessGrantStatus.ACTIVE,
            userId: updatedGrant.userId,
            inviteEmail: grant.inviteEmail,
            verificationMethod: updatedGrant.verificationMethod,
          },
        });

        await tx.notification.create({
          data: {
            orgId: grant.owner.orgId,
            recipientUserId: token.userId,
            type: NotificationType.OWNER_ACCESS_GRANTED,
            title: 'Owner access granted',
            body: `You can now access ${grant.owner.name}.`,
            data: {
              kind: 'owner_access',
              ownerId: grant.owner.id,
              grantId: updatedGrant.id,
              status: OwnerAccessGrantStatus.ACTIVE,
            },
          },
        });
      }

      if (token.purpose === 'PROVIDER_INVITE') {
        await tx.serviceProviderAccessGrant.updateMany({
          where: {
            userId: token.userId,
            status: ServiceProviderAccessGrantStatus.PENDING,
          },
          data: {
            status: ServiceProviderAccessGrantStatus.ACTIVE,
            acceptedAt: now,
            invitedAt: null,
            inviteEmail: null,
            disabledAt: null,
            disabledByUserId: null,
            verificationMethod: 'PROVIDER_INVITE',
          },
        });
      }

      await tx.passwordResetToken.deleteMany({
        where: {
          userId: token.userId,
          id: { not: token.id },
        },
      });

      return true;
    });
  }

  async getRoleKeys(userId: string, orgId: string | null): Promise<string[]> {
    const assignments = await this.prisma.userAccessAssignment.findMany({
      where: {
        userId,
        scopeType: AccessScopeType.ORG,
        scopeId: null,
        roleTemplate: {
          orgId,
          scopeType: AccessScopeType.ORG,
        },
      },
      include: { roleTemplate: true },
    });
    return assignments.map((entry) => entry.roleTemplate.key);
  }
}

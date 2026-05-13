import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OwnerAccessGrant,
  OwnerAccessGrantAuditAction,
  OwnerAccessGrantStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NotificationTypeEnum } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeEmail } from '../users/user-identity.util';

@Injectable()
export class OwnerAccessGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listForOwner(input: {
    orgId: string;
    ownerId: string;
    status?: OwnerAccessGrantStatus;
  }) {
    await this.assertOwnerInOrg(input.orgId, input.ownerId);

    return this.prisma.ownerAccessGrant.findMany({
      where: {
        ownerId: input.ownerId,
        ...(input.status ? { status: input.status } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            orgId: true,
            isActive: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async listHistoryForOwner(input: {
    orgId: string;
    ownerId: string;
    grantId?: string;
    action?: OwnerAccessGrantAuditAction;
  }) {
    await this.assertOwnerInOrg(input.orgId, input.ownerId);

    return this.prisma.ownerAccessGrantAudit.findMany({
      where: {
        ownerId: input.ownerId,
        ...(input.grantId ? { grantId: input.grantId } : {}),
        ...(input.action ? { action: input.action } : {}),
      },
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createPendingInvite(input: {
    actorUserId: string;
    orgId: string;
    ownerId: string;
    email: string;
  }) {
    const owner = await this.assertOwnerInOrg(input.orgId, input.ownerId);
    this.assertOwnerActive(owner.isActive);
    await this.assertOwnerHasNoActiveGrant(owner.id);

    const inviteEmail = normalizeEmail(input.email);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: inviteEmail, mode: 'insensitive' } },
      select: { id: true, isActive: true, mustChangePassword: true },
    });
    if (user && !user.isActive) {
      throw new BadRequestException('User not found or inactive');
    }

    if (user) {
      await this.assertNoOpenGrantForPair(user.id, owner.id, inviteEmail);
      if (user.mustChangePassword) {
        const grant = await this.createPendingEmailGrant({
          actorUserId: input.actorUserId,
          ownerId: owner.id,
          userId: user.id,
          inviteEmail,
        });

        await this.authService.requestPasswordReset(inviteEmail, {
          purpose: 'OWNER_INVITE',
          issuedByUserId: input.actorUserId,
        });

        return grant;
      }

      return this.createActiveGrant({
        actorUserId: input.actorUserId,
        owner,
        userId: user.id,
        verificationMethod: 'EMAIL_MATCH',
        action: OwnerAccessGrantAuditAction.LINKED,
      });
    }

    const createdUser = await this.createOwnerPortalUser(
      inviteEmail,
      owner.name,
    );
    await this.assertNoOpenGrantForPair(createdUser.id, owner.id, inviteEmail);

    const grant = await this.createPendingEmailGrant({
      actorUserId: input.actorUserId,
      ownerId: owner.id,
      userId: createdUser.id,
      inviteEmail,
    });

    await this.authService.requestPasswordReset(inviteEmail, {
      purpose: 'OWNER_INVITE',
      issuedByUserId: input.actorUserId,
    });

    return grant;
  }

  async linkExistingUser(input: {
    actorUserId: string;
    orgId: string;
    ownerId: string;
    userId: string;
  }) {
    const owner = await this.assertOwnerInOrg(input.orgId, input.ownerId);
    this.assertOwnerActive(owner.isActive);
    await this.assertOwnerHasNoActiveGrant(owner.id);
    await this.assertNoOpenGrantForPair(input.userId, owner.id);

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, mustChangePassword: true },
    });
    if (!user || !user.isActive) {
      throw new BadRequestException('User not found or inactive');
    }
    this.assertPasswordSetupComplete(user.mustChangePassword);

    const grant = await this.prisma.ownerAccessGrant.create({
      data: {
        userId: user.id,
        ownerId: owner.id,
        status: OwnerAccessGrantStatus.ACTIVE,
        inviteEmail: null,
        invitedAt: null,
        acceptedAt: new Date(),
        grantedByUserId: input.actorUserId,
        verificationMethod: 'ADMIN_LINK',
      },
    });

    await this.createAudit({
      grantId: grant.id,
      ownerId: owner.id,
      actorUserId: input.actorUserId,
      action: OwnerAccessGrantAuditAction.LINKED,
      fromStatus: null,
      toStatus: OwnerAccessGrantStatus.ACTIVE,
      userId: grant.userId,
      inviteEmail: grant.inviteEmail,
      verificationMethod: grant.verificationMethod,
    });

    await this.notificationsService.createForUsers({
      orgId: owner.orgId,
      userIds: [user.id],
      type: NotificationTypeEnum.OWNER_ACCESS_GRANTED,
      title: 'Owner access granted',
      body: `You can now access ${owner.name}.`,
      data: {
        kind: 'owner_access',
        ownerId: owner.id,
        grantId: grant.id,
        status: OwnerAccessGrantStatus.ACTIVE,
      },
    });

    return grant;
  }

  async activatePendingGrant(input: {
    actorUserId: string;
    orgId: string;
    ownerId: string;
    grantId: string;
    userId: string;
    verificationMethod?: string | null;
  }) {
    const owner = await this.assertOwnerInOrg(input.orgId, input.ownerId);
    this.assertOwnerActive(owner.isActive);
    await this.assertOwnerHasNoActiveGrant(owner.id);

    const grant = await this.prisma.ownerAccessGrant.findFirst({
      where: { id: input.grantId, ownerId: input.ownerId },
      select: { id: true, status: true },
    });
    if (!grant) {
      throw new NotFoundException('Owner access grant not found');
    }
    if (grant.status !== OwnerAccessGrantStatus.PENDING) {
      throw new ConflictException(
        'Only pending owner access grants can be activated',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, mustChangePassword: true },
    });
    if (!user || !user.isActive) {
      throw new BadRequestException('User not found or inactive');
    }
    this.assertPasswordSetupComplete(user.mustChangePassword);

    const verificationMethod = this.assertManualVerificationMethod(
      input.verificationMethod,
      'ADMIN_LINK',
    );

    await this.assertNoOpenGrantForPair(user.id, owner.id, undefined, grant.id);

    const updated = await this.prisma.ownerAccessGrant.update({
      where: { id: grant.id },
      data: {
        userId: user.id,
        status: OwnerAccessGrantStatus.ACTIVE,
        acceptedAt: new Date(),
        invitedAt: null,
        inviteEmail: null,
        disabledAt: null,
        disabledByUserId: null,
        verificationMethod,
        grantedByUserId: input.actorUserId,
      },
    });

    await this.createAudit({
      grantId: updated.id,
      ownerId: owner.id,
      actorUserId: input.actorUserId,
      action: OwnerAccessGrantAuditAction.ACTIVATED,
      fromStatus: OwnerAccessGrantStatus.PENDING,
      toStatus: OwnerAccessGrantStatus.ACTIVE,
      userId: updated.userId,
      inviteEmail: updated.inviteEmail,
      verificationMethod: updated.verificationMethod,
    });

    await this.notificationsService.createForUsers({
      orgId: owner.orgId,
      userIds: [user.id],
      type: NotificationTypeEnum.OWNER_ACCESS_GRANTED,
      title: 'Owner access granted',
      body: `You can now access ${owner.name}.`,
      data: {
        kind: 'owner_access',
        ownerId: owner.id,
        grantId: updated.id,
        status: OwnerAccessGrantStatus.ACTIVE,
      },
    });

    return updated;
  }

  async disableGrant(input: {
    actorUserId: string;
    orgId: string;
    ownerId: string;
    grantId: string;
    verificationMethod?: string | null;
  }) {
    const owner = await this.assertOwnerInOrg(input.orgId, input.ownerId);
    const grant = await this.prisma.ownerAccessGrant.findFirst({
      where: { id: input.grantId, ownerId: input.ownerId },
    });
    if (!grant) {
      throw new NotFoundException('Owner access grant not found');
    }
    if (grant.status === OwnerAccessGrantStatus.DISABLED) {
      throw new ConflictException('Owner access grant is already disabled');
    }

    const previousStatus = grant.status;
    const previousUserId = grant.userId;
    const previousInviteEmail = grant.inviteEmail;
    const nextVerificationMethod =
      input.verificationMethod ?? grant.verificationMethod;

    const updated = await this.prisma.ownerAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: OwnerAccessGrantStatus.DISABLED,
        disabledAt: new Date(),
        disabledByUserId: input.actorUserId,
        verificationMethod: nextVerificationMethod,
      },
    });

    await this.createAudit({
      grantId: updated.id,
      ownerId: owner.id,
      actorUserId: input.actorUserId,
      action: OwnerAccessGrantAuditAction.DISABLED,
      fromStatus: previousStatus,
      toStatus: OwnerAccessGrantStatus.DISABLED,
      userId: previousUserId,
      inviteEmail: previousInviteEmail,
      verificationMethod: nextVerificationMethod,
    });

    if (previousUserId) {
      await this.notificationsService.createForUsers({
        orgId: owner.orgId,
        userIds: [previousUserId],
        type: NotificationTypeEnum.OWNER_ACCESS_DISABLED,
        title: 'Owner access disabled',
        body: `${owner.name} is no longer available in your portfolio.`,
        data: {
          kind: 'owner_access',
          ownerId: owner.id,
          grantId: updated.id,
          status: OwnerAccessGrantStatus.DISABLED,
        },
      });
    }

    return updated;
  }

  async resendInvite(input: {
    actorUserId?: string | null;
    orgId: string;
    ownerId: string;
    grantId: string;
  }) {
    await this.assertOwnerInOrg(input.orgId, input.ownerId);
    const grant = await this.prisma.ownerAccessGrant.findFirst({
      where: { id: input.grantId, ownerId: input.ownerId },
    });
    if (!grant) {
      throw new NotFoundException('Owner access grant not found');
    }
    if (grant.status === OwnerAccessGrantStatus.ACTIVE) {
      return this.resendActiveSetupInvite({
        grant,
        actorUserId: input.actorUserId ?? null,
      });
    }
    if (grant.status !== OwnerAccessGrantStatus.PENDING) {
      throw new ConflictException(
        'Only pending owner access grants can be resent',
      );
    }
    if (!grant.userId || !grant.inviteEmail) {
      throw new ConflictException(
        'Only email-based pending owner access grants can be resent',
      );
    }
    const inviteEmail = grant.inviteEmail;

    const updated = await this.prisma.ownerAccessGrant.update({
      where: { id: grant.id },
      data: {
        invitedAt: new Date(),
      },
    });

    await this.createAudit({
      grantId: updated.id,
      ownerId: updated.ownerId,
      actorUserId: null,
      action: OwnerAccessGrantAuditAction.RESENT,
      fromStatus: OwnerAccessGrantStatus.PENDING,
      toStatus: OwnerAccessGrantStatus.PENDING,
      userId: updated.userId,
      inviteEmail: updated.inviteEmail,
      verificationMethod: updated.verificationMethod,
    });

    await this.authService.requestPasswordReset(inviteEmail, {
      purpose: 'OWNER_INVITE',
      issuedByUserId: input.actorUserId ?? null,
    });

    return updated;
  }

  private async resendActiveSetupInvite(input: {
    grant: OwnerAccessGrant;
    actorUserId?: string | null;
  }) {
    if (!input.grant.userId) {
      throw new ConflictException(
        'Only linked owner access grants can receive setup recovery emails',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.grant.userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        mustChangePassword: true,
      },
    });
    if (!user || !user.isActive) {
      throw new ConflictException(
        'Cannot resend setup email for an inactive or missing user',
      );
    }
    if (!user.mustChangePassword) {
      throw new ConflictException(
        'Only pending owner access grants can be resent',
      );
    }

    await this.createAudit({
      grantId: input.grant.id,
      ownerId: input.grant.ownerId,
      actorUserId: input.actorUserId ?? null,
      action: OwnerAccessGrantAuditAction.RESENT,
      fromStatus: OwnerAccessGrantStatus.ACTIVE,
      toStatus: OwnerAccessGrantStatus.ACTIVE,
      userId: input.grant.userId,
      inviteEmail: user.email,
      verificationMethod: input.grant.verificationMethod,
    });

    await this.authService.requestPasswordReset(user.email, {
      purpose: 'OWNER_INVITE',
      issuedByUserId: input.actorUserId ?? null,
    });

    return input.grant;
  }

  private async assertOwnerInOrg(orgId: string, ownerId: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, orgId },
      select: { id: true, orgId: true, name: true, isActive: true },
    });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
    return owner;
  }

  private assertOwnerActive(isActive: boolean) {
    if (!isActive) {
      throw new ConflictException(
        'Inactive owners cannot receive access grants',
      );
    }
  }

  private assertPasswordSetupComplete(mustChangePassword: boolean) {
    if (mustChangePassword) {
      throw new ConflictException(
        'User must complete password setup before owner access can be activated',
      );
    }
  }

  private assertManualVerificationMethod(
    verificationMethod: string | null | undefined,
    fallback: string,
  ) {
    const value = verificationMethod?.trim() || fallback;
    if (
      value === 'EMAIL_MATCH' ||
      value === 'OWNER_INVITE' ||
      value === 'PROVIDER_INVITE'
    ) {
      throw new BadRequestException(
        'Reserved verification method cannot be supplied manually',
      );
    }
    return value;
  }

  private async assertOwnerHasNoActiveGrant(ownerId: string) {
    const existing = await this.prisma.ownerAccessGrant.findFirst({
      where: { ownerId, status: OwnerAccessGrantStatus.ACTIVE },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Owner already has an active representative; disable it first',
      );
    }
  }

  private async assertNoOpenGrantForPair(
    userId: string | null,
    ownerId: string,
    inviteEmail?: string,
    excludeGrantId?: string,
  ) {
    const existing = await this.prisma.ownerAccessGrant.findFirst({
      where: {
        ownerId,
        ...(excludeGrantId ? { id: { not: excludeGrantId } } : {}),
        status: {
          in: [OwnerAccessGrantStatus.PENDING, OwnerAccessGrantStatus.ACTIVE],
        },
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(inviteEmail ? [{ inviteEmail }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'An open owner access grant already exists for this user or invite email',
      );
    }
  }

  private async createAudit(input: {
    grantId: string;
    ownerId: string;
    actorUserId?: string | null;
    action: OwnerAccessGrantAuditAction;
    fromStatus?: OwnerAccessGrantStatus | null;
    toStatus: OwnerAccessGrantStatus;
    userId?: string | null;
    inviteEmail?: string | null;
    verificationMethod?: string | null;
  }) {
    await this.prisma.ownerAccessGrantAudit.create({
      data: {
        grantId: input.grantId,
        ownerId: input.ownerId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus,
        userId: input.userId ?? null,
        inviteEmail: input.inviteEmail ?? null,
        verificationMethod: input.verificationMethod ?? null,
      },
    });
  }

  private async createActiveGrant(input: {
    actorUserId: string;
    owner: { id: string; orgId: string; name: string };
    userId: string;
    verificationMethod: string;
    action: OwnerAccessGrantAuditAction;
  }) {
    const grant = await this.prisma.ownerAccessGrant.create({
      data: {
        userId: input.userId,
        ownerId: input.owner.id,
        status: OwnerAccessGrantStatus.ACTIVE,
        inviteEmail: null,
        invitedAt: null,
        acceptedAt: new Date(),
        grantedByUserId: input.actorUserId,
        verificationMethod: input.verificationMethod,
      },
    });

    await this.createAudit({
      grantId: grant.id,
      ownerId: input.owner.id,
      actorUserId: input.actorUserId,
      action: input.action,
      fromStatus: null,
      toStatus: OwnerAccessGrantStatus.ACTIVE,
      userId: grant.userId,
      inviteEmail: grant.inviteEmail,
      verificationMethod: grant.verificationMethod,
    });

    await this.notificationsService.createForUsers({
      orgId: input.owner.orgId,
      userIds: [input.userId],
      type: NotificationTypeEnum.OWNER_ACCESS_GRANTED,
      title: 'Owner access granted',
      body: `You can now access ${input.owner.name}.`,
      data: {
        kind: 'owner_access',
        ownerId: input.owner.id,
        grantId: grant.id,
        status: OwnerAccessGrantStatus.ACTIVE,
      },
    });

    return grant;
  }

  private async createPendingEmailGrant(input: {
    actorUserId: string;
    ownerId: string;
    userId: string;
    inviteEmail: string;
  }) {
    const grant = await this.prisma.ownerAccessGrant.create({
      data: {
        userId: input.userId,
        ownerId: input.ownerId,
        status: OwnerAccessGrantStatus.PENDING,
        inviteEmail: input.inviteEmail,
        invitedAt: new Date(),
        grantedByUserId: input.actorUserId,
      },
    });

    await this.createAudit({
      grantId: grant.id,
      ownerId: input.ownerId,
      actorUserId: input.actorUserId,
      action: OwnerAccessGrantAuditAction.INVITED,
      fromStatus: null,
      toStatus: OwnerAccessGrantStatus.PENDING,
      userId: grant.userId,
      inviteEmail: grant.inviteEmail,
      verificationMethod: grant.verificationMethod,
    });

    return grant;
  }

  private async createOwnerPortalUser(email: string, ownerName: string) {
    const passwordHash = await argon2.hash(this.generateTempPassword());
    return this.prisma.user.create({
      data: {
        email,
        name: ownerName,
        passwordHash,
        orgId: null,
        mustChangePassword: true,
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  private generateTempPassword() {
    return randomBytes(12).toString('base64url');
  }
}

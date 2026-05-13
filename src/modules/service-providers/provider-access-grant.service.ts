import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ServiceProviderAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { normalizeEmail } from '../users/user-identity.util';
import { ServiceProvidersRepo } from './service-providers.repo';

@Injectable()
export class ProviderAccessGrantService {
  constructor(
    private readonly serviceProvidersRepo: ServiceProvidersRepo,
    private readonly authService: AuthService,
  ) {}

  async listForProvider(input: { orgId: string; providerId: string }) {
    await this.assertProviderVisibleToOrg(input.orgId, input.providerId);
    return this.serviceProvidersRepo.listAccessGrants(input.providerId);
  }

  async createPendingInvite(input: {
    actorUserId: string;
    orgId: string;
    providerId: string;
    email: string;
  }) {
    const provider = await this.assertProviderVisibleToOrg(
      input.orgId,
      input.providerId,
    );

    const openGrantCount =
      await this.serviceProvidersRepo.countOpenAccessGrants(provider.id);
    if (openGrantCount > 0) {
      throw new ConflictException(
        'Provider already has an open admin access grant',
      );
    }

    const inviteEmail = normalizeEmail(input.email);
    let user =
      await this.serviceProvidersRepo.findUserByEmailInsensitive(inviteEmail);

    if (user) {
      if (!user.isActive) {
        throw new BadRequestException('User not found or inactive');
      }
      if (user.orgId) {
        throw new BadRequestException(
          'Provider admin email cannot belong to an org-scoped user',
        );
      }
    } else {
      user = await this.serviceProvidersRepo.createStandaloneUser({
        email: inviteEmail,
        name: provider.contactName ?? provider.name,
        passwordHash: await argon2.hash(this.generateTempPassword()),
        orgId: null,
        mustChangePassword: true,
        isActive: true,
      });
    }

    await this.serviceProvidersRepo.upsertMembership(
      provider.id,
      user.id,
      ServiceProviderUserRole.ADMIN,
      true,
    );

    const grant = await this.serviceProvidersRepo.createAccessGrant({
      user: { connect: { id: user.id } },
      serviceProvider: { connect: { id: provider.id } },
      status: ServiceProviderAccessGrantStatus.PENDING,
      inviteEmail,
      invitedAt: new Date(),
      grantedByUser: { connect: { id: input.actorUserId } },
      verificationMethod: 'PROVIDER_INVITE',
    });

    await this.authService.requestPasswordReset(inviteEmail, {
      purpose: 'PROVIDER_INVITE',
      issuedByUserId: input.actorUserId,
    });

    return grant;
  }

  async resendInvite(input: {
    actorUserId: string;
    orgId: string;
    providerId: string;
    grantId: string;
  }) {
    await this.assertProviderVisibleToOrg(input.orgId, input.providerId);
    const grant = await this.serviceProvidersRepo.findAccessGrant(
      input.providerId,
      input.grantId,
    );
    if (!grant) {
      throw new NotFoundException('Provider access grant not found');
    }
    if (grant.status !== ServiceProviderAccessGrantStatus.PENDING) {
      throw new ConflictException(
        'Only pending provider access grants can be resent',
      );
    }
    if (!grant.inviteEmail) {
      throw new ConflictException('Grant is not email-invite based');
    }

    const updated = await this.serviceProvidersRepo.updateAccessGrant(
      grant.id,
      {
        invitedAt: new Date(),
      },
    );

    await this.authService.requestPasswordReset(grant.inviteEmail, {
      purpose: 'PROVIDER_INVITE',
      issuedByUserId: input.actorUserId,
    });

    return updated;
  }

  async disableGrant(input: {
    actorUserId: string;
    orgId: string;
    providerId: string;
    grantId: string;
    verificationMethod?: string | null;
  }) {
    await this.assertProviderVisibleToOrg(input.orgId, input.providerId);
    const grant = await this.serviceProvidersRepo.findAccessGrant(
      input.providerId,
      input.grantId,
    );
    if (!grant) {
      throw new NotFoundException('Provider access grant not found');
    }
    if (grant.status === ServiceProviderAccessGrantStatus.DISABLED) {
      throw new ConflictException('Provider access grant is already disabled');
    }

    return this.serviceProvidersRepo.updateAccessGrant(grant.id, {
      status: ServiceProviderAccessGrantStatus.DISABLED,
      disabledAt: new Date(),
      disabledByUser: { connect: { id: input.actorUserId } },
      verificationMethod: input.verificationMethod ?? grant.verificationMethod,
    });
  }

  private async assertProviderVisibleToOrg(orgId: string, providerId: string) {
    const provider = await this.serviceProvidersRepo.findByIdForOrg(
      providerId,
      orgId,
    );
    if (!provider) {
      throw new NotFoundException('Service provider not found');
    }
    return provider;
  }

  private generateTempPassword() {
    return randomBytes(12).toString('base64url');
  }
}

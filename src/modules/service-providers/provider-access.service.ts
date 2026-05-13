import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ServiceProviderAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import {
  ProviderMembershipWithAccess,
  ServiceProvidersRepo,
} from './service-providers.repo';

export type AccessibleProviderMembership = ProviderMembershipWithAccess & {
  hasActiveGrant: boolean;
  requiresGrant: boolean;
};

@Injectable()
export class ProviderAccessService {
  constructor(private readonly serviceProvidersRepo: ServiceProvidersRepo) {}

  async listAccessibleMemberships(
    userId: string,
  ): Promise<AccessibleProviderMembership[]> {
    const memberships =
      await this.serviceProvidersRepo.findActiveMembershipsForUser(userId);

    return memberships
      .map((membership) => this.toAccessibleMembership(userId, membership))
      .filter(
        (membership): membership is AccessibleProviderMembership =>
          membership !== null,
      );
  }

  async getSingleAccessibleMembership(
    userId: string,
    role?: ServiceProviderUserRole,
  ) {
    const memberships = await this.listAccessibleMemberships(userId);
    const scoped = role
      ? memberships.filter((membership) => membership.role === role)
      : memberships;

    if (scoped.length === 0) {
      throw new ForbiddenException('Forbidden');
    }
    if (scoped.length > 1) {
      throw new ConflictException(
        'Multiple active provider memberships require explicit provider selection',
      );
    }

    return scoped[0];
  }

  async getAccessibleProviderContext(userId: string) {
    const memberships = await this.listAccessibleMemberships(userId);
    if (memberships.length === 0) {
      throw new ForbiddenException('Forbidden');
    }

    return {
      providerIds: new Set(
        memberships.map((membership) => membership.serviceProviderId),
      ),
      adminProviderIds: new Set(
        memberships
          .filter(
            (membership) => membership.role === ServiceProviderUserRole.ADMIN,
          )
          .map((membership) => membership.serviceProviderId),
      ),
      memberships,
    };
  }

  private toAccessibleMembership(
    userId: string,
    membership: ProviderMembershipWithAccess,
  ): AccessibleProviderMembership | null {
    const grants = membership.serviceProvider.accessGrants.filter(
      (grant) => grant.userId === userId,
    );
    const hasActiveGrant = grants.some(
      (grant) => grant.status === ServiceProviderAccessGrantStatus.ACTIVE,
    );
    const requiresGrant = grants.length > 0;

    if (requiresGrant && !hasActiveGrant) {
      return null;
    }

    return {
      ...membership,
      hasActiveGrant,
      requiresGrant,
    };
  }
}

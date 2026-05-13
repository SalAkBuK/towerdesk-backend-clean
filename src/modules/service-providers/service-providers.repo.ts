import {
  Prisma,
  ServiceProviderAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

const buildOrgServiceProviderInclude = (orgId: string) =>
  ({
    buildings: {
      where: {
        building: {
          orgId,
        },
      },
      include: {
        building: {
          select: {
            id: true,
            orgId: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    },
    accessGrants: {
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    },
  }) satisfies Prisma.ServiceProviderInclude;

const providerPortalInclude = {
  users: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          orgId: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
  },
  accessGrants: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          orgId: true,
          isActive: true,
          mustChangePassword: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.ServiceProviderInclude;

const providerMembershipInclude = {
  serviceProvider: {
    include: {
      accessGrants: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      orgId: true,
      isActive: true,
      mustChangePassword: true,
    },
  },
} satisfies Prisma.ServiceProviderUserInclude;

export type ServiceProviderOrgView = Prisma.ServiceProviderGetPayload<{
  include: ReturnType<typeof buildOrgServiceProviderInclude>;
}>;

export type ProviderPortalView = Prisma.ServiceProviderGetPayload<{
  include: typeof providerPortalInclude;
}>;

export type ProviderMembershipWithAccess =
  Prisma.ServiceProviderUserGetPayload<{
    include: typeof providerMembershipInclude;
  }>;

type ServiceProviderCreateData = {
  name: string;
  serviceCategory?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

type ServiceProviderUpdateData = Partial<ServiceProviderCreateData>;

@Injectable()
export class ServiceProvidersRepo {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string, search?: string): Promise<ServiceProviderOrgView[]> {
    return this.prisma.serviceProvider.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { serviceCategory: { contains: search, mode: 'insensitive' } },
              { contactName: { contains: search, mode: 'insensitive' } },
              { contactEmail: { contains: search, mode: 'insensitive' } },
              { contactPhone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: buildOrgServiceProviderInclude(orgId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findByIdForOrg(
    providerId: string,
    orgId: string,
  ): Promise<ServiceProviderOrgView | null> {
    return this.prisma.serviceProvider.findUnique({
      where: { id: providerId },
      include: buildOrgServiceProviderInclude(orgId),
    });
  }

  findPortalViewById(providerId: string): Promise<ProviderPortalView | null> {
    return this.prisma.serviceProvider.findUnique({
      where: { id: providerId },
      include: providerPortalInclude,
    });
  }

  findById(providerId: string) {
    return this.prisma.serviceProvider.findUnique({
      where: { id: providerId },
    });
  }

  findBuildingForOrg(orgId: string, buildingId: string) {
    return this.prisma.building.findFirst({
      where: {
        id: buildingId,
        orgId,
      },
      select: {
        id: true,
        orgId: true,
        name: true,
      },
    });
  }

  findUserByEmailInsensitive(email: string) {
    return this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
    });
  }

  findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  create(
    data: ServiceProviderCreateData,
    orgIdForView: string,
  ): Promise<ServiceProviderOrgView> {
    return this.prisma.serviceProvider.create({
      data: {
        name: data.name,
        serviceCategory: data.serviceCategory ?? null,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        notes: data.notes ?? null,
        isActive: data.isActive ?? true,
      },
      include: buildOrgServiceProviderInclude(orgIdForView),
    });
  }

  update(
    providerId: string,
    data: ServiceProviderUpdateData,
    orgIdForView: string,
  ): Promise<ServiceProviderOrgView> {
    return this.prisma.serviceProvider.update({
      where: { id: providerId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.serviceCategory !== undefined
          ? { serviceCategory: data.serviceCategory }
          : {}),
        ...(data.contactName !== undefined
          ? { contactName: data.contactName }
          : {}),
        ...(data.contactEmail !== undefined
          ? { contactEmail: data.contactEmail }
          : {}),
        ...(data.contactPhone !== undefined
          ? { contactPhone: data.contactPhone }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: buildOrgServiceProviderInclude(orgIdForView),
    });
  }

  updatePortalView(
    providerId: string,
    data: ServiceProviderUpdateData,
  ): Promise<ProviderPortalView> {
    return this.prisma.serviceProvider.update({
      where: { id: providerId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.serviceCategory !== undefined
          ? { serviceCategory: data.serviceCategory }
          : {}),
        ...(data.contactName !== undefined
          ? { contactName: data.contactName }
          : {}),
        ...(data.contactEmail !== undefined
          ? { contactEmail: data.contactEmail }
          : {}),
        ...(data.contactPhone !== undefined
          ? { contactPhone: data.contactPhone }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: providerPortalInclude,
    });
  }

  async linkBuilding(
    providerId: string,
    buildingId: string,
    orgIdForView: string,
  ): Promise<ServiceProviderOrgView> {
    await this.prisma.serviceProviderBuilding.upsert({
      where: {
        serviceProviderId_buildingId: {
          serviceProviderId: providerId,
          buildingId,
        },
      },
      update: {},
      create: {
        serviceProviderId: providerId,
        buildingId,
      },
    });

    return this.prisma.serviceProvider.findUniqueOrThrow({
      where: { id: providerId },
      include: buildOrgServiceProviderInclude(orgIdForView),
    });
  }

  async unlinkBuilding(
    providerId: string,
    buildingId: string,
    orgIdForView: string,
  ): Promise<ServiceProviderOrgView> {
    await this.prisma.serviceProviderBuilding.delete({
      where: {
        serviceProviderId_buildingId: {
          serviceProviderId: providerId,
          buildingId,
        },
      },
    });

    return this.prisma.serviceProvider.findUniqueOrThrow({
      where: { id: providerId },
      include: buildOrgServiceProviderInclude(orgIdForView),
    });
  }

  countActiveAccessGrants(providerId: string) {
    return this.prisma.serviceProviderAccessGrant.count({
      where: {
        serviceProviderId: providerId,
        status: ServiceProviderAccessGrantStatus.ACTIVE,
      },
    });
  }

  countOpenAccessGrants(providerId: string) {
    return this.prisma.serviceProviderAccessGrant.count({
      where: {
        serviceProviderId: providerId,
        status: {
          in: [
            ServiceProviderAccessGrantStatus.PENDING,
            ServiceProviderAccessGrantStatus.ACTIVE,
          ],
        },
      },
    });
  }

  listAccessGrants(providerId: string) {
    return this.prisma.serviceProviderAccessGrant.findMany({
      where: {
        serviceProviderId: providerId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findAccessGrant(providerId: string, grantId: string) {
    return this.prisma.serviceProviderAccessGrant.findFirst({
      where: {
        id: grantId,
        serviceProviderId: providerId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
      },
    });
  }

  createAccessGrant(data: Prisma.ServiceProviderAccessGrantCreateInput) {
    return this.prisma.serviceProviderAccessGrant.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
      },
    });
  }

  updateAccessGrant(
    grantId: string,
    data: Prisma.ServiceProviderAccessGrantUpdateInput,
  ) {
    return this.prisma.serviceProviderAccessGrant.update({
      where: { id: grantId },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
      },
    });
  }

  createStandaloneUser(data: Prisma.UserUncheckedCreateInput) {
    return this.prisma.user.create({
      data,
    });
  }

  updateUser(userId: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  findMembership(providerId: string, userId: string) {
    return this.prisma.serviceProviderUser.findUnique({
      where: {
        serviceProviderId_userId: {
          serviceProviderId: providerId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  upsertMembership(
    providerId: string,
    userId: string,
    role: ServiceProviderUserRole,
    isActive = true,
  ) {
    return this.prisma.serviceProviderUser.upsert({
      where: {
        serviceProviderId_userId: {
          serviceProviderId: providerId,
          userId,
        },
      },
      update: {
        role,
        isActive,
      },
      create: {
        serviceProviderId: providerId,
        userId,
        role,
        isActive,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  listStaff(providerId: string) {
    return this.prisma.serviceProviderUser.findMany({
      where: {
        serviceProviderId: providerId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            orgId: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
  }

  findActiveMembershipsForUser(
    userId: string,
  ): Promise<ProviderMembershipWithAccess[]> {
    return this.prisma.serviceProviderUser.findMany({
      where: {
        userId,
        isActive: true,
        user: {
          isActive: true,
        },
        serviceProvider: {
          isActive: true,
        },
      },
      include: providerMembershipInclude,
      orderBy: [{ createdAt: 'asc' }, { serviceProviderId: 'asc' }],
    });
  }
}

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ServiceProviderAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { AuthService } from '../src/modules/auth/auth.service';
import { ProviderAccessGrantsController } from '../src/modules/service-providers/provider-access-grants.controller';
import { ProviderAccessGrantService } from '../src/modules/service-providers/provider-access-grant.service';
import { ProviderAccessService } from '../src/modules/service-providers/provider-access.service';
import { ProviderPortalController } from '../src/modules/service-providers/provider-portal.controller';
import { ProviderPortalService } from '../src/modules/service-providers/provider-portal.service';
import { ServiceProvidersController } from '../src/modules/service-providers/service-providers.controller';
import { ServiceProvidersRepo } from '../src/modules/service-providers/service-providers.repo';
import { ServiceProvidersService } from '../src/modules/service-providers/service-providers.service';

type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  passwordHash: string;
  orgId: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
};

type ProviderRecord = {
  id: string;
  name: string;
  serviceCategory: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderBuildingRecord = {
  serviceProviderId: string;
  buildingId: string;
  createdAt: Date;
};

type ProviderMembershipRecord = {
  serviceProviderId: string;
  userId: string;
  role: ServiceProviderUserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderAccessGrantRecord = {
  id: string;
  userId: string;
  serviceProviderId: string;
  status: ServiceProviderAccessGrantStatus;
  inviteEmail: string | null;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  grantedByUserId: string | null;
  disabledAt: Date | null;
  disabledByUserId: string | null;
  verificationMethod: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let repo: InMemoryServiceProvidersRepo;
const authService = {
  requestPasswordReset: jest.fn(async () => ({ success: true })),
};

class InMemoryServiceProvidersRepo {
  private users: UserRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private providers: ProviderRecord[] = [];
  private providerBuildings: ProviderBuildingRecord[] = [];
  private providerMemberships: ProviderMembershipRecord[] = [];
  private accessGrants: ProviderAccessGrantRecord[] = [];

  reset() {
    this.users = [];
    this.buildings = [];
    this.providers = [];
    this.providerBuildings = [];
    this.providerMemberships = [];
    this.accessGrants = [];
  }

  seedUser(input: {
    email: string;
    orgId: string | null;
    name?: string | null;
    phone?: string | null;
    mustChangePassword?: boolean;
    isActive?: boolean;
  }) {
    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      name: input.name ?? null,
      phone: input.phone ?? null,
      passwordHash: 'hash',
      orgId: input.orgId,
      mustChangePassword: input.mustChangePassword ?? false,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  seedBuilding(input: { orgId: string; name: string }) {
    const building: BuildingRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      name: input.name,
    };
    this.buildings.push(building);
    return building;
  }

  findSeededUserByEmail(email: string) {
    return (
      this.users.find(
        (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
      ) ?? null
    );
  }

  activateGrant(grantId: string) {
    const grant = this.accessGrants.find((entry) => entry.id === grantId);
    if (!grant) {
      throw new Error('Grant not found');
    }
    grant.status = ServiceProviderAccessGrantStatus.ACTIVE;
    grant.acceptedAt = new Date();
    grant.updatedAt = new Date();
    return this.withGrantUser(grant);
  }

  async list(orgId: string, search?: string) {
    const normalizedSearch = search?.trim().toLowerCase();
    const providers = this.providers
      .filter((provider) => {
        if (!normalizedSearch) {
          return true;
        }
        const values = [
          provider.name,
          provider.serviceCategory,
          provider.contactName,
          provider.contactEmail,
          provider.contactPhone,
        ]
          .filter((value): value is string => Boolean(value))
          .map((value) => value.toLowerCase());
        return values.some((value) => value.includes(normalizedSearch));
      })
      .sort((left, right) => {
        if (right.createdAt.getTime() !== left.createdAt.getTime()) {
          return right.createdAt.getTime() - left.createdAt.getTime();
        }
        return right.id.localeCompare(left.id);
      });

    return providers.map((provider) => this.buildOrgView(provider, orgId));
  }

  async findByIdForOrg(providerId: string, orgId: string) {
    const provider =
      this.providers.find((entry) => entry.id === providerId) ?? null;
    return provider ? this.buildOrgView(provider, orgId) : null;
  }

  async findPortalViewById(providerId: string) {
    const provider =
      this.providers.find((entry) => entry.id === providerId) ?? null;
    return provider ? this.buildPortalView(provider) : null;
  }

  async findBuildingForOrg(orgId: string, buildingId: string) {
    const building =
      this.buildings.find(
        (entry) => entry.id === buildingId && entry.orgId === orgId,
      ) ?? null;
    if (!building) {
      return null;
    }
    return {
      id: building.id,
      orgId: building.orgId,
      name: building.name,
    };
  }

  async findUserByEmailInsensitive(email: string) {
    return this.findSeededUserByEmail(email);
  }

  async create(data: {
    name: string;
    serviceCategory?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }) {
    const now = new Date();
    const provider: ProviderRecord = {
      id: randomUUID(),
      name: data.name,
      serviceCategory: data.serviceCategory ?? null,
      contactName: data.contactName ?? null,
      contactEmail: data.contactEmail ?? null,
      contactPhone: data.contactPhone ?? null,
      notes: data.notes ?? null,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.providers.push(provider);
    return this.buildOrgView(provider, '');
  }

  async update(
    providerId: string,
    data: Partial<ProviderRecord>,
    orgIdForView: string,
  ) {
    const provider = this.requireProvider(providerId);
    Object.assign(provider, data, {
      updatedAt: new Date(),
    });
    return this.buildOrgView(provider, orgIdForView);
  }

  async updatePortalView(providerId: string, data: Partial<ProviderRecord>) {
    const provider = this.requireProvider(providerId);
    Object.assign(provider, data, {
      updatedAt: new Date(),
    });
    return this.buildPortalView(provider);
  }

  async linkBuilding(
    providerId: string,
    buildingId: string,
    orgIdForView: string,
  ) {
    this.requireProvider(providerId);
    const existing = this.providerBuildings.find(
      (entry) =>
        entry.serviceProviderId === providerId &&
        entry.buildingId === buildingId,
    );
    if (!existing) {
      this.providerBuildings.push({
        serviceProviderId: providerId,
        buildingId,
        createdAt: new Date(),
      });
    }
    return this.buildOrgView(this.requireProvider(providerId), orgIdForView);
  }

  async unlinkBuilding(
    providerId: string,
    buildingId: string,
    orgIdForView: string,
  ) {
    this.providerBuildings = this.providerBuildings.filter(
      (entry) =>
        !(
          entry.serviceProviderId === providerId &&
          entry.buildingId === buildingId
        ),
    );
    return this.buildOrgView(this.requireProvider(providerId), orgIdForView);
  }

  async countActiveAccessGrants(providerId: string) {
    return this.accessGrants.filter(
      (grant) =>
        grant.serviceProviderId === providerId &&
        grant.status === ServiceProviderAccessGrantStatus.ACTIVE,
    ).length;
  }

  async countOpenAccessGrants(providerId: string) {
    const openStatuses: ServiceProviderAccessGrantStatus[] = [
      ServiceProviderAccessGrantStatus.PENDING,
      ServiceProviderAccessGrantStatus.ACTIVE,
    ];
    return this.accessGrants.filter(
      (grant) =>
        grant.serviceProviderId === providerId &&
        openStatuses.includes(grant.status),
    ).length;
  }

  async listAccessGrants(providerId: string) {
    return this.sortedGrants(providerId).map((grant) =>
      this.withGrantUser(grant),
    );
  }

  async findAccessGrant(providerId: string, grantId: string) {
    const grant =
      this.accessGrants.find(
        (entry) =>
          entry.id === grantId && entry.serviceProviderId === providerId,
      ) ?? null;
    return grant ? this.withGrantUser(grant) : null;
  }

  async createAccessGrant(data: {
    user: { connect: { id: string } };
    serviceProvider: { connect: { id: string } };
    status: ServiceProviderAccessGrantStatus;
    inviteEmail?: string | null;
    invitedAt?: Date | null;
    grantedByUser?: { connect: { id: string } };
    verificationMethod?: string | null;
  }) {
    const now = new Date();
    const grant: ProviderAccessGrantRecord = {
      id: randomUUID(),
      userId: data.user.connect.id,
      serviceProviderId: data.serviceProvider.connect.id,
      status: data.status,
      inviteEmail: data.inviteEmail ?? null,
      invitedAt: data.invitedAt ?? null,
      acceptedAt: null,
      grantedByUserId: data.grantedByUser?.connect.id ?? null,
      disabledAt: null,
      disabledByUserId: null,
      verificationMethod: data.verificationMethod ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.accessGrants.push(grant);
    return this.withGrantUser(grant);
  }

  async updateAccessGrant(
    grantId: string,
    data: {
      status?: ServiceProviderAccessGrantStatus;
      invitedAt?: Date | null;
      acceptedAt?: Date | null;
      disabledAt?: Date | null;
      disabledByUser?: { connect: { id: string } };
      verificationMethod?: string | null;
    },
  ) {
    const grant = this.accessGrants.find((entry) => entry.id === grantId);
    if (!grant) {
      throw new Error('Grant not found');
    }
    Object.assign(grant, {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.invitedAt !== undefined ? { invitedAt: data.invitedAt } : {}),
      ...(data.acceptedAt !== undefined ? { acceptedAt: data.acceptedAt } : {}),
      ...(data.disabledAt !== undefined ? { disabledAt: data.disabledAt } : {}),
      ...(data.disabledByUser
        ? { disabledByUserId: data.disabledByUser.connect.id }
        : {}),
      ...(data.verificationMethod !== undefined
        ? { verificationMethod: data.verificationMethod }
        : {}),
      updatedAt: new Date(),
    });
    return this.withGrantUser(grant);
  }

  async createStandaloneUser(data: {
    email: string;
    name?: string | null;
    phone?: string | null;
    passwordHash: string;
    orgId: string | null;
    mustChangePassword: boolean;
    isActive: boolean;
  }) {
    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      email: data.email,
      name: data.name ?? null,
      phone: data.phone ?? null,
      passwordHash: data.passwordHash,
      orgId: data.orgId,
      mustChangePassword: data.mustChangePassword,
      isActive: data.isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  async findMembership(providerId: string, userId: string) {
    const membership =
      this.providerMemberships.find(
        (entry) =>
          entry.serviceProviderId === providerId && entry.userId === userId,
      ) ?? null;
    return membership ? this.withMembershipUser(membership) : null;
  }

  async upsertMembership(
    providerId: string,
    userId: string,
    role: ServiceProviderUserRole,
    isActive = true,
  ) {
    const existing = this.providerMemberships.find(
      (entry) =>
        entry.serviceProviderId === providerId && entry.userId === userId,
    );
    if (existing) {
      existing.role = role;
      existing.isActive = isActive;
      existing.updatedAt = new Date();
      return this.withMembershipUser(existing);
    }

    const now = new Date();
    const membership: ProviderMembershipRecord = {
      serviceProviderId: providerId,
      userId,
      role,
      isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.providerMemberships.push(membership);
    return this.withMembershipUser(membership);
  }

  async listStaff(providerId: string) {
    return this.providerMemberships
      .filter((entry) => entry.serviceProviderId === providerId)
      .sort((left, right) => {
        if (left.createdAt.getTime() !== right.createdAt.getTime()) {
          return left.createdAt.getTime() - right.createdAt.getTime();
        }
        return left.userId.localeCompare(right.userId);
      })
      .map((entry) => this.withMembershipUser(entry));
  }

  async findActiveMembershipsForUser(userId: string) {
    return this.providerMemberships
      .filter((membership) => {
        if (membership.userId !== userId || !membership.isActive) {
          return false;
        }
        const user = this.requireUser(membership.userId);
        const provider = this.requireProvider(membership.serviceProviderId);
        return user.isActive && provider.isActive;
      })
      .sort((left, right) => {
        if (left.createdAt.getTime() !== right.createdAt.getTime()) {
          return left.createdAt.getTime() - right.createdAt.getTime();
        }
        return left.serviceProviderId.localeCompare(right.serviceProviderId);
      })
      .map((membership) => ({
        ...membership,
        serviceProvider: {
          ...this.requireProvider(membership.serviceProviderId),
          accessGrants: this.sortedGrants(membership.serviceProviderId).map(
            (grant) => ({
              ...grant,
            }),
          ),
        },
        user: this.selectUser(membership.userId),
      }));
  }

  findUserById(userId: string) {
    return this.users.find((entry) => entry.id === userId) ?? null;
  }

  private buildOrgView(provider: ProviderRecord, orgId: string) {
    return {
      ...provider,
      buildings: this.providerBuildings
        .filter(
          (entry) =>
            entry.serviceProviderId === provider.id &&
            this.requireBuilding(entry.buildingId).orgId === orgId,
        )
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
        )
        .map((entry) => ({
          serviceProviderId: entry.serviceProviderId,
          buildingId: entry.buildingId,
          createdAt: entry.createdAt,
          building: this.requireBuilding(entry.buildingId),
        })),
      accessGrants: this.sortedGrants(provider.id).map((grant) =>
        this.withGrantUser(grant),
      ),
    };
  }

  private buildPortalView(provider: ProviderRecord) {
    return {
      ...provider,
      users: this.providerMemberships
        .filter((entry) => entry.serviceProviderId === provider.id)
        .sort((left, right) => {
          if (left.createdAt.getTime() !== right.createdAt.getTime()) {
            return left.createdAt.getTime() - right.createdAt.getTime();
          }
          return left.userId.localeCompare(right.userId);
        })
        .map((entry) => this.withMembershipUser(entry)),
      accessGrants: this.sortedGrants(provider.id).map((grant) =>
        this.withGrantUser(grant),
      ),
    };
  }

  private sortedGrants(providerId: string) {
    return this.accessGrants
      .filter((entry) => entry.serviceProviderId === providerId)
      .sort((left, right) => {
        if (right.createdAt.getTime() !== left.createdAt.getTime()) {
          return right.createdAt.getTime() - left.createdAt.getTime();
        }
        return right.id.localeCompare(left.id);
      });
  }

  private withGrantUser(grant: ProviderAccessGrantRecord) {
    return {
      ...grant,
      user: this.selectUser(grant.userId),
    };
  }

  private withMembershipUser(membership: ProviderMembershipRecord) {
    return {
      ...membership,
      user: this.selectUser(membership.userId),
    };
  }

  private selectUser(userId: string) {
    const user = this.requireUser(userId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      orgId: user.orgId,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private requireProvider(providerId: string) {
    const provider = this.providers.find((entry) => entry.id === providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    return provider;
  }

  private requireUser(userId: string) {
    const user = this.users.find((entry) => entry.id === userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  private requireBuilding(buildingId: string) {
    const building = this.buildings.find((entry) => entry.id === buildingId);
    if (!building) {
      throw new Error('Building not found');
    }
    return building;
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    if (!userId || typeof userId !== 'string') {
      return false;
    }

    const user = repo.findUserById(userId);
    if (!user || !user.isActive) {
      return false;
    }

    request.user = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
    };
    return true;
  }
}

@Injectable()
class AllowPermissionsGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('Service providers (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgAdminA: UserRecord;
  let orgAdminB: UserRecord;
  let buildingA: BuildingRecord;
  let buildingB: BuildingRecord;

  beforeAll(async () => {
    repo = new InMemoryServiceProvidersRepo();

    const moduleRef = await Test.createTestingModule({
      controllers: [
        ServiceProvidersController,
        ProviderAccessGrantsController,
        ProviderPortalController,
      ],
      providers: [
        ServiceProvidersService,
        ProviderAccessGrantService,
        ProviderAccessService,
        ProviderPortalService,
        OrgScopeGuard,
        {
          provide: ServiceProvidersRepo,
          useValue: repo,
        },
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(AllowPermissionsGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    repo.reset();
    authService.requestPasswordReset.mockClear();
    orgAdminA = repo.seedUser({
      email: 'admin-a@towerdesk.test',
      orgId: 'org-a',
      name: 'Org Admin A',
    });
    orgAdminB = repo.seedUser({
      email: 'admin-b@towerdesk.test',
      orgId: 'org-b',
      name: 'Org Admin B',
    });
    buildingA = repo.seedBuilding({
      orgId: 'org-a',
      name: 'Marina Tower',
    });
    buildingB = repo.seedBuilding({
      orgId: 'org-b',
      name: 'Palm Residences',
    });
  });

  it('creates a global provider with an initial building link and pending provider-admin invite', async () => {
    const response = await fetch(`${baseUrl}/org/service-providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAdminA.id,
      },
      body: JSON.stringify({
        name: 'RapidFix Technical Services',
        serviceCategory: 'Plumbing',
        buildingIds: [buildingA.id],
        adminEmail: 'Admin@RapidFix.test',
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      name: 'RapidFix Technical Services',
      serviceCategory: 'Plumbing',
      isLinkedToCurrentOrg: true,
      providerProfileOwnedByProvider: false,
      linkedBuildings: [
        expect.objectContaining({
          buildingId: buildingA.id,
          buildingName: buildingA.name,
        }),
      ],
      providerAdminAccessGrants: [
        expect.objectContaining({
          status: ServiceProviderAccessGrantStatus.PENDING,
          inviteEmail: 'admin@rapidfix.test',
          user: expect.objectContaining({
            email: 'admin@rapidfix.test',
            mustChangePassword: true,
          }),
        }),
      ],
    });

    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'admin@rapidfix.test',
      {
        purpose: 'PROVIDER_INVITE',
        issuedByUserId: orgAdminA.id,
      },
    );

    const grantsResponse = await fetch(
      `${baseUrl}/org/service-providers/${body.id}/access-grants`,
      {
        headers: { 'x-user-id': orgAdminA.id },
      },
    );
    expect(grantsResponse.status).toBe(200);
    await expect(grantsResponse.json()).resolves.toEqual([
      expect.objectContaining({
        status: ServiceProviderAccessGrantStatus.PENDING,
        inviteEmail: 'admin@rapidfix.test',
      }),
    ]);
  });

  it('lets another org discover the same provider and link it to its own building', async () => {
    const createResponse = await fetch(`${baseUrl}/org/service-providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAdminA.id,
      },
      body: JSON.stringify({
        name: 'BlueLine HVAC',
        buildingIds: [buildingA.id],
      }),
    });
    const created = await createResponse.json();

    const listForOrgB = await fetch(
      `${baseUrl}/org/service-providers?search=blueline`,
      {
        headers: { 'x-user-id': orgAdminB.id },
      },
    );
    expect(listForOrgB.status).toBe(200);
    const listBody = await listForOrgB.json();
    expect(listBody).toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'BlueLine HVAC',
        isLinkedToCurrentOrg: false,
        linkedBuildings: [],
      }),
    ]);

    const linkResponse = await fetch(
      `${baseUrl}/org/service-providers/${created.id}/buildings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdminB.id,
        },
        body: JSON.stringify({ buildingId: buildingB.id }),
      },
    );
    expect(linkResponse.status).toBe(201);
    const linked = await linkResponse.json();
    expect(linked).toMatchObject({
      id: created.id,
      isLinkedToCurrentOrg: true,
      linkedBuildings: [
        expect.objectContaining({
          buildingId: buildingB.id,
          buildingName: buildingB.name,
        }),
      ],
    });

    const orgAView = await fetch(
      `${baseUrl}/org/service-providers/${created.id}`,
      {
        headers: { 'x-user-id': orgAdminA.id },
      },
    );
    expect(orgAView.status).toBe(200);
    await expect(orgAView.json()).resolves.toMatchObject({
      id: created.id,
      linkedBuildings: [
        expect.objectContaining({
          buildingId: buildingA.id,
          buildingName: buildingA.name,
        }),
      ],
    });
  });

  it('blocks org-side profile edits after provider-admin ownership becomes active', async () => {
    const createResponse = await fetch(`${baseUrl}/org/service-providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAdminA.id,
      },
      body: JSON.stringify({
        name: 'NorthStar Electric',
        buildingIds: [buildingA.id],
        adminEmail: 'ops@northstar.test',
      }),
    });
    const created = await createResponse.json();
    const grant = created.providerAdminAccessGrants[0] as { id: string };
    const adminUser = repo.findSeededUserByEmail('ops@northstar.test');
    expect(adminUser).not.toBeNull();
    repo.activateGrant(grant.id);

    const patchResponse = await fetch(
      `${baseUrl}/org/service-providers/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdminA.id,
        },
        body: JSON.stringify({ name: 'NorthStar Electrical' }),
      },
    );
    expect(patchResponse.status).toBe(409);

    const providerMeResponse = await fetch(`${baseUrl}/provider/me`, {
      headers: { 'x-user-id': adminUser!.id },
    });
    expect(providerMeResponse.status).toBe(200);
    await expect(providerMeResponse.json()).resolves.toMatchObject({
      userId: adminUser!.id,
      email: 'ops@northstar.test',
      providers: [
        expect.objectContaining({
          providerId: created.id,
          role: ServiceProviderUserRole.ADMIN,
          name: 'NorthStar Electric',
        }),
      ],
    });
  });

  it('allows provider admins to manage profile and staff while standalone workers stay out of org routes', async () => {
    const createResponse = await fetch(`${baseUrl}/org/service-providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAdminA.id,
      },
      body: JSON.stringify({
        name: 'MetroLift Services',
        serviceCategory: 'Elevators',
        buildingIds: [buildingA.id],
        adminEmail: 'admin@metrolift.test',
      }),
    });
    const created = await createResponse.json();
    const grant = created.providerAdminAccessGrants[0] as { id: string };
    const adminUser = repo.findSeededUserByEmail('admin@metrolift.test');
    expect(adminUser).not.toBeNull();
    repo.activateGrant(grant.id);

    const updateProfileResponse = await fetch(`${baseUrl}/provider/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': adminUser!.id,
      },
      body: JSON.stringify({
        contactName: 'Raza Malik',
        contactPhone: '+971500001111',
      }),
    });
    expect(updateProfileResponse.status).toBe(200);
    await expect(updateProfileResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: 'MetroLift Services',
      contactName: 'Raza Malik',
      contactPhone: '+971500001111',
    });

    const createStaffResponse = await fetch(`${baseUrl}/provider/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': adminUser!.id,
      },
      body: JSON.stringify({
        email: 'tech.one@metrolift.test',
        name: 'Tech One',
        role: ServiceProviderUserRole.WORKER,
      }),
    });
    expect(createStaffResponse.status).toBe(201);
    const createdStaff = await createStaffResponse.json();
    expect(createdStaff).toMatchObject({
      email: 'tech.one@metrolift.test',
      name: 'Tech One',
      role: ServiceProviderUserRole.WORKER,
      membershipIsActive: true,
      userIsActive: true,
      mustChangePassword: true,
    });
    expect(createdStaff.tempPassword).toEqual(expect.any(String));

    const listStaffResponse = await fetch(`${baseUrl}/provider/staff`, {
      headers: { 'x-user-id': adminUser!.id },
    });
    expect(listStaffResponse.status).toBe(200);
    const staffList = await listStaffResponse.json();
    expect(staffList).toHaveLength(2);
    expect(
      staffList.map((entry: { role: ServiceProviderUserRole }) => entry.role),
    ).toEqual([ServiceProviderUserRole.ADMIN, ServiceProviderUserRole.WORKER]);

    const disableWorkerResponse = await fetch(
      `${baseUrl}/provider/staff/${createdStaff.userId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser!.id,
        },
        body: JSON.stringify({ isActive: false }),
      },
    );
    expect(disableWorkerResponse.status).toBe(200);
    await expect(disableWorkerResponse.json()).resolves.toMatchObject({
      userId: createdStaff.userId,
      membershipIsActive: false,
    });

    const workerUser = repo.findSeededUserByEmail('tech.one@metrolift.test');
    expect(workerUser).not.toBeNull();
    const orgRouteResponse = await fetch(`${baseUrl}/org/service-providers`, {
      headers: { 'x-user-id': workerUser!.id },
    });
    expect(orgRouteResponse.status).toBe(403);
  });
});

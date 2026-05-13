import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  OwnerAccessGrantAuditAction,
  OwnerAccessGrantStatus,
} from '@prisma/client';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { OwnerAccessGrantsController } from '../src/modules/owners/owner-access-grants.controller';
import { OwnerAccessGrantService } from '../src/modules/owners/owner-access-grant.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  name?: string | null;
};

type OwnerRecord = {
  id: string;
  orgId: string;
  name: string;
  isActive: boolean;
};

type OwnerAccessGrantRecord = {
  id: string;
  userId: string | null;
  ownerId: string;
  status: OwnerAccessGrantStatus;
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

type OwnerAccessGrantAuditRecord = {
  id: string;
  grantId: string;
  ownerId: string;
  actorUserId: string | null;
  action: OwnerAccessGrantAuditAction;
  fromStatus: OwnerAccessGrantStatus | null;
  toStatus: OwnerAccessGrantStatus;
  userId: string | null;
  inviteEmail: string | null;
  verificationMethod: string | null;
  createdAt: Date;
};

let prisma: InMemoryPrismaService;
const authService = {
  requestPasswordReset: jest.fn(async () => ({ success: true })),
};

class InMemoryPrismaService {
  private users: UserRecord[] = [];
  private owners: OwnerRecord[] = [];
  private grants: OwnerAccessGrantRecord[] = [];
  private grantAudits: OwnerAccessGrantAuditRecord[] = [];

  user = {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: {
        id?: boolean;
        isActive?: boolean;
        email?: boolean;
        orgId?: boolean;
        name?: boolean;
        mustChangePassword?: boolean;
      };
    }) => {
      const user = this.users.find((item) => item.id === where.id) ?? null;
      if (!user) {
        return null;
      }
      if (!select) {
        return user;
      }
      return {
        ...(select.id ? { id: user.id } : {}),
        ...(select.isActive !== undefined ? { isActive: user.isActive } : {}),
        ...(select.email ? { email: user.email } : {}),
        ...(select.orgId ? { orgId: user.orgId } : {}),
        ...(select.name ? { name: user.name ?? null } : {}),
        ...(select.mustChangePassword !== undefined
          ? { mustChangePassword: user.mustChangePassword }
          : {}),
      };
    },
    findFirst: async ({
      where,
      select,
    }: {
      where: { email: { equals: string; mode: 'insensitive' } };
      select?: {
        id?: boolean;
        isActive?: boolean;
        mustChangePassword?: boolean;
      };
    }) => {
      const email = where.email.equals.toLowerCase();
      const user =
        this.users.find((item) => item.email.toLowerCase() === email) ?? null;
      if (!user) {
        return null;
      }
      if (!select) {
        return user;
      }
      return {
        ...(select.id ? { id: user.id } : {}),
        ...(select.isActive !== undefined ? { isActive: user.isActive } : {}),
        ...(select.mustChangePassword !== undefined
          ? { mustChangePassword: user.mustChangePassword }
          : {}),
      };
    },
    create: async ({
      data,
      select,
    }: {
      data: {
        email: string;
        name?: string | null;
        passwordHash: string;
        orgId: string | null;
        mustChangePassword: boolean;
        isActive: boolean;
      };
      select?: { id?: boolean };
    }) => {
      const created: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        isActive: data.isActive,
        mustChangePassword: data.mustChangePassword,
        name: data.name ?? null,
      };
      this.users.push(created);
      if (!select) {
        return created;
      }
      return {
        ...(select.id ? { id: created.id } : {}),
      };
    },
  };

  owner = {
    findFirst: async ({
      where,
      select,
    }: {
      where: { id: string; orgId: string };
      select?: {
        id?: boolean;
        orgId?: boolean;
        name?: boolean;
        isActive?: boolean;
      };
    }) => {
      const owner =
        this.owners.find(
          (item) => item.id === where.id && item.orgId === where.orgId,
        ) ?? null;
      if (!owner) {
        return null;
      }
      if (!select) {
        return owner;
      }
      return {
        ...(select.id ? { id: owner.id } : {}),
        ...(select.orgId ? { orgId: owner.orgId } : {}),
        ...(select.name ? { name: owner.name } : {}),
        ...(select.isActive !== undefined ? { isActive: owner.isActive } : {}),
      };
    },
  };

  ownerAccessGrant = {
    findFirst: async ({
      where,
      select,
    }: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      const grant =
        this.grants.find((item) => this.matchesGrantWhere(item, where)) ?? null;
      if (!grant) {
        return null;
      }
      if (!select) {
        return grant;
      }
      return Object.fromEntries(
        Object.entries(select)
          .filter(([, include]) => include)
          .map(([key]) => [key, (grant as Record<string, unknown>)[key]]),
      );
    },
    create: async ({
      data,
    }: {
      data: Omit<OwnerAccessGrantRecord, 'id' | 'createdAt' | 'updatedAt'>;
    }) => {
      const now = new Date();
      const created: OwnerAccessGrantRecord = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.grants.push(created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<OwnerAccessGrantRecord>;
    }) => {
      const grant = this.grants.find((item) => item.id === where.id);
      if (!grant) {
        throw new Error('Grant not found');
      }
      Object.assign(grant, data, { updatedAt: new Date() });
      return grant;
    },
    findMany: async ({
      where,
      include,
      orderBy,
    }: {
      where: { ownerId: string; status?: OwnerAccessGrantStatus };
      include?: {
        user?: {
          select?: {
            id?: boolean;
            email?: boolean;
            orgId?: boolean;
            isActive?: boolean;
            name?: boolean;
          };
        };
      };
      orderBy?: Array<{ createdAt?: 'desc'; id?: 'desc' }>;
    }) => {
      let grants = this.grants.filter(
        (grant) => grant.ownerId === where.ownerId,
      );
      if (where.status) {
        grants = grants.filter((grant) => grant.status === where.status);
      }
      if (orderBy?.length) {
        grants = [...grants].sort((left, right) => {
          if (right.createdAt.getTime() !== left.createdAt.getTime()) {
            return right.createdAt.getTime() - left.createdAt.getTime();
          }
          return right.id.localeCompare(left.id);
        });
      }

      return grants.map((grant) => ({
        ...grant,
        user: include?.user
          ? this.selectUser(grant.userId, include.user.select)
          : undefined,
      }));
    },
  };

  ownerAccessGrantAudit = {
    create: async ({
      data,
    }: {
      data: Omit<OwnerAccessGrantAuditRecord, 'id' | 'createdAt'>;
    }) => {
      const created: OwnerAccessGrantAuditRecord = {
        id: randomUUID(),
        createdAt: new Date(),
        ...data,
      };
      this.grantAudits.push(created);
      return created;
    },
    findMany: async ({
      where,
      include,
      orderBy,
    }: {
      where: {
        ownerId: string;
        grantId?: string;
        action?: OwnerAccessGrantAuditAction;
      };
      include?: {
        actorUser?: {
          select?: { id?: boolean; email?: boolean; name?: boolean };
        };
      };
      orderBy?: Array<{ createdAt?: 'desc'; id?: 'desc' }>;
    }) => {
      let audits = this.grantAudits.filter(
        (audit) => audit.ownerId === where.ownerId,
      );
      if (where.grantId) {
        audits = audits.filter((audit) => audit.grantId === where.grantId);
      }
      if (where.action) {
        audits = audits.filter((audit) => audit.action === where.action);
      }
      if (orderBy?.length) {
        audits = [...audits].sort((left, right) => {
          if (right.createdAt.getTime() !== left.createdAt.getTime()) {
            return right.createdAt.getTime() - left.createdAt.getTime();
          }
          return right.id.localeCompare(left.id);
        });
      }

      return audits.map((audit) => ({
        ...audit,
        actorUser: include?.actorUser
          ? this.selectUser(audit.actorUserId, include.actorUser.select)
          : undefined,
      }));
    },
  };

  private matchesGrantWhere(
    grant: OwnerAccessGrantRecord,
    where: Record<string, unknown>,
  ): boolean {
    const entries = Object.entries(where);
    for (const [key, value] of entries) {
      if (key === 'OR' && Array.isArray(value)) {
        const orMatched = value.some((candidate) =>
          this.matchesGrantWhere(grant, candidate as Record<string, unknown>),
        );
        if (!orMatched) {
          return false;
        }
        continue;
      }

      if (key === 'status' && typeof value === 'object' && value !== null) {
        const statusValue = value as { in?: OwnerAccessGrantStatus[] };
        if (statusValue.in && !statusValue.in.includes(grant.status)) {
          return false;
        }
        continue;
      }

      if (key === 'id' && typeof value === 'object' && value !== null) {
        const idFilter = value as { not?: string };
        if (idFilter.not && grant.id === idFilter.not) {
          return false;
        }
        continue;
      }

      if ((grant as Record<string, unknown>)[key] !== value) {
        return false;
      }
    }
    return true;
  }

  reset() {
    this.users = [];
    this.owners = [];
    this.grants = [];
    this.grantAudits = [];
  }

  seedUser(input: {
    email: string;
    orgId: string | null;
    isActive?: boolean;
    mustChangePassword?: boolean;
  }) {
    const created: UserRecord = {
      id: randomUUID(),
      email: input.email,
      orgId: input.orgId,
      isActive: input.isActive ?? true,
      mustChangePassword: input.mustChangePassword ?? false,
      name: null,
    };
    this.users.push(created);
    return created;
  }

  seedOwner(input: { orgId: string; isActive?: boolean; name?: string }) {
    const created: OwnerRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      name: input.name ?? 'Owner Record',
      isActive: input.isActive ?? true,
    };
    this.owners.push(created);
    return created;
  }

  seedOwnerAccessGrant(
    input: Partial<OwnerAccessGrantRecord> & {
      ownerId: string;
      userId?: string | null;
    },
  ) {
    const now = new Date();
    const created: OwnerAccessGrantRecord = {
      id: input.id ?? randomUUID(),
      userId: input.userId ?? null,
      ownerId: input.ownerId,
      status: input.status ?? OwnerAccessGrantStatus.ACTIVE,
      inviteEmail: input.inviteEmail ?? null,
      invitedAt: input.invitedAt ?? null,
      acceptedAt: input.acceptedAt ?? now,
      grantedByUserId: input.grantedByUserId ?? null,
      disabledAt: input.disabledAt ?? null,
      disabledByUserId: input.disabledByUserId ?? null,
      verificationMethod: input.verificationMethod ?? 'ADMIN_LINK',
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    this.grants.push(created);
    return created;
  }

  getGrantsForOwner(ownerId: string) {
    return this.grants.filter((grant) => grant.ownerId === ownerId);
  }

  getGrantAuditsForOwner(ownerId: string) {
    return this.grantAudits.filter((audit) => audit.ownerId === ownerId);
  }

  private selectUser(
    userId: string | null,
    select?: {
      id?: boolean;
      email?: boolean;
      orgId?: boolean;
      isActive?: boolean;
      name?: boolean;
    },
  ) {
    if (!userId) {
      return null;
    }
    const user = this.users.find((item) => item.id === userId) ?? null;
    if (!user) {
      return null;
    }
    if (!select) {
      return user;
    }
    return {
      ...(select.id ? { id: user.id } : {}),
      ...(select.email ? { email: user.email } : {}),
      ...(select.orgId ? { orgId: user.orgId } : {}),
      ...(select.isActive !== undefined ? { isActive: user.isActive } : {}),
      ...(select.name ? { name: user.name ?? null } : {}),
    };
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !('email' in user) || !('orgId' in user) || !user.isActive) {
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

describe('Owner access grants (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgAdmin: UserRecord;
  let representativeA: UserRecord;
  let representativeB: UserRecord;
  let owner: OwnerRecord;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [OwnerAccessGrantsController],
      providers: [
        OwnerAccessGrantService,
        OrgScopeGuard,
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: NotificationsService,
          useValue: {
            createForUsers: async () => [],
          },
        },
        { provide: PrismaService, useValue: prisma },
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
    prisma.reset();
    authService.requestPasswordReset.mockClear();
    orgAdmin = prisma.seedUser({
      email: 'admin@org-a.test',
      orgId: 'org-a',
    });
    representativeA = prisma.seedUser({
      email: 'rep-a@test.com',
      orgId: null,
    });
    representativeB = prisma.seedUser({
      email: 'rep-b@test.com',
      orgId: null,
    });
    owner = prisma.seedOwner({ orgId: 'org-a', isActive: true });
  });

  it('auto-links an existing user by email and then disables the active grant', async () => {
    const createResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: 'Rep-A@Test.com' }),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      ownerId: owner.id,
      status: OwnerAccessGrantStatus.ACTIVE,
      inviteEmail: null,
      userId: representativeA.id,
      verificationMethod: 'EMAIL_MATCH',
    });
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();

    const disableResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${created.id}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ verificationMethod: 'MANUAL' }),
      },
    );
    expect(disableResponse.status).toBe(201);
    const disabled = await disableResponse.json();
    expect(disabled).toMatchObject({
      id: created.id,
      status: OwnerAccessGrantStatus.DISABLED,
      disabledByUserId: orgAdmin.id,
      verificationMethod: 'MANUAL',
    });
  });

  it('keeps an existing user who must set password pending and sends owner invite', async () => {
    const setupRequiredUser = prisma.seedUser({
      email: 'setup-required@test.com',
      orgId: null,
      mustChangePassword: true,
    });

    const createResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: 'Setup-Required@Test.com' }),
      },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      ownerId: owner.id,
      status: OwnerAccessGrantStatus.PENDING,
      inviteEmail: 'setup-required@test.com',
      userId: setupRequiredUser.id,
      verificationMethod: null,
    });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'setup-required@test.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: orgAdmin.id,
      },
    );
  });

  it('lists owner access grants with linked user visibility and optional status filtering', async () => {
    const pendingResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: 'new-owner@test.com' }),
      },
    );
    expect(pendingResponse.status).toBe(201);
    const pending = await pendingResponse.json();
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'new-owner@test.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: orgAdmin.id,
      },
    );

    const disablePendingResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${pending.id}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({}),
      },
    );
    expect(disablePendingResponse.status).toBe(201);

    const activeResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/link-existing-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ userId: representativeB.id }),
      },
    );
    expect(activeResponse.status).toBe(201);
    const active = await activeResponse.json();

    const listResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(2);
    expect(listBody[0]).toMatchObject({
      id: active.id,
      status: OwnerAccessGrantStatus.ACTIVE,
      linkedUser: {
        id: representativeB.id,
        email: representativeB.email,
        orgId: null,
        isActive: true,
      },
    });
    expect(listBody[1]).toMatchObject({
      id: pending.id,
      status: OwnerAccessGrantStatus.DISABLED,
      linkedUser: {
        email: 'new-owner@test.com',
      },
    });

    const filteredResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants?status=ACTIVE`,
      {
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(filteredResponse.status).toBe(200);
    const filteredBody = await filteredResponse.json();
    expect(filteredBody).toHaveLength(1);
    expect(filteredBody[0]).toMatchObject({
      id: active.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
  });

  it('returns 404 when listing owner access grants across orgs', async () => {
    const otherOrgAdmin = prisma.seedUser({
      email: 'admin@org-b.test',
      orgId: 'org-b',
    });

    const response = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        headers: { 'x-user-id': otherOrgAdmin.id },
      },
    );

    expect(response.status).toBe(404);
  });

  it('returns owner access grant history with filtering', async () => {
    const createResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: 'new-owner@test.com' }),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const resendResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${created.id}/resend-invite`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(resendResponse.status).toBe(201);

    const activateResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${created.id}/activate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({
          userId: representativeA.id,
          verificationMethod: 'MANUAL',
        }),
      },
    );
    expect(activateResponse.status).toBe(201);
    expect(authService.requestPasswordReset).toHaveBeenNthCalledWith(
      2,
      'new-owner@test.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: orgAdmin.id,
      },
    );

    const disableResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${created.id}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ verificationMethod: 'MANUAL' }),
      },
    );
    expect(disableResponse.status).toBe(201);

    const historyResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/history`,
      {
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(historyResponse.status).toBe(200);
    const historyBody = await historyResponse.json();
    expect(historyBody).toHaveLength(4);
    expect(
      historyBody.map(
        (entry: { action: OwnerAccessGrantAuditAction }) => entry.action,
      ),
    ).toEqual([
      OwnerAccessGrantAuditAction.DISABLED,
      OwnerAccessGrantAuditAction.ACTIVATED,
      OwnerAccessGrantAuditAction.RESENT,
      OwnerAccessGrantAuditAction.INVITED,
    ]);
    expect(historyBody[0]).toMatchObject({
      grantId: created.id,
      ownerId: owner.id,
      action: OwnerAccessGrantAuditAction.DISABLED,
      fromStatus: OwnerAccessGrantStatus.ACTIVE,
      toStatus: OwnerAccessGrantStatus.DISABLED,
      actorUserId: orgAdmin.id,
      userId: representativeA.id,
      verificationMethod: 'MANUAL',
      actorUser: {
        id: orgAdmin.id,
        email: orgAdmin.email,
      },
    });

    const filteredHistoryResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/history?grantId=${created.id}&action=${OwnerAccessGrantAuditAction.ACTIVATED}`,
      {
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(filteredHistoryResponse.status).toBe(200);
    const filteredHistoryBody = await filteredHistoryResponse.json();
    expect(filteredHistoryBody).toHaveLength(1);
    expect(filteredHistoryBody[0]).toMatchObject({
      grantId: created.id,
      action: OwnerAccessGrantAuditAction.ACTIVATED,
      fromStatus: OwnerAccessGrantStatus.PENDING,
      toStatus: OwnerAccessGrantStatus.ACTIVE,
    });
  });

  it('links an existing user as the active representative without creating a pending invite', async () => {
    const response = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/link-existing-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ userId: representativeA.id }),
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      ownerId: owner.id,
      userId: representativeA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
      inviteEmail: null,
      verificationMethod: 'ADMIN_LINK',
    });
  });

  it('rejects linking users without completed password setup', async () => {
    const setupRequiredUser = prisma.seedUser({
      email: 'active-setup-required@test.com',
      orgId: null,
      mustChangePassword: true,
    });

    const linkResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/link-existing-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ userId: setupRequiredUser.id }),
      },
    );

    expect(linkResponse.status).toBe(409);
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('resends setup recovery for legacy active grants linked to users without completed password setup', async () => {
    const setupRequiredUser = prisma.seedUser({
      email: 'active-setup-required@test.com',
      orgId: null,
      mustChangePassword: true,
    });
    const active = prisma.seedOwnerAccessGrant({
      ownerId: owner.id,
      userId: setupRequiredUser.id,
      status: OwnerAccessGrantStatus.ACTIVE,
      verificationMethod: 'ADMIN_LINK',
      grantedByUserId: orgAdmin.id,
    });

    const resendResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${active.id}/resend-invite`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAdmin.id },
      },
    );

    expect(resendResponse.status).toBe(201);
    const resent = await resendResponse.json();
    expect(resent).toMatchObject({
      id: active.id,
      status: OwnerAccessGrantStatus.ACTIVE,
      userId: setupRequiredUser.id,
    });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith(
      'active-setup-required@test.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: orgAdmin.id,
      },
    );
  });

  it('allows resend only for pending grants', async () => {
    const createResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: 'new-owner@test.com' }),
      },
    );
    const pending = await createResponse.json();
    expect(pending.status).toBe(OwnerAccessGrantStatus.PENDING);

    const resendPending = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${pending.id}/resend-invite`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(resendPending.status).toBe(201);
    expect(authService.requestPasswordReset).toHaveBeenNthCalledWith(
      2,
      'new-owner@test.com',
      {
        purpose: 'OWNER_INVITE',
        issuedByUserId: orgAdmin.id,
      },
    );

    const activateResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${pending.id}/activate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ userId: representativeA.id }),
      },
    );
    expect(activateResponse.status).toBe(201);

    const resendActive = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${pending.id}/resend-invite`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(resendActive.status).toBe(409);

    const disableResponse = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${pending.id}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({}),
      },
    );
    expect(disableResponse.status).toBe(201);

    const resendDisabled = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${pending.id}/resend-invite`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgAdmin.id },
      },
    );
    expect(resendDisabled.status).toBe(409);
  });

  it('rejects second active representative and requires explicit disable before new grant', async () => {
    const linkFirst = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/link-existing-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ userId: representativeA.id }),
      },
    );
    expect(linkFirst.status).toBe(201);
    const activeGrant = await linkFirst.json();
    expect(activeGrant.status).toBe(OwnerAccessGrantStatus.ACTIVE);

    const secondActive = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/link-existing-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ userId: representativeB.id }),
      },
    );
    expect(secondActive.status).toBe(409);

    const createWhileActive = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: representativeB.email }),
      },
    );
    expect(createWhileActive.status).toBe(409);

    const disable = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${activeGrant.id}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({}),
      },
    );
    expect(disable.status).toBe(201);

    const createAfterDisable = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: representativeB.email }),
      },
    );
    expect(createAfterDisable.status).toBe(201);
    const bodyAfterDisable = await createAfterDisable.json();
    expect(bodyAfterDisable.status).toBe(OwnerAccessGrantStatus.ACTIVE);
  });

  it('rejects duplicate open grants for same user-owner pair', async () => {
    const first = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: representativeA.email }),
      },
    );
    expect(first.status).toBe(201);

    const duplicate = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/link-existing-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ userId: representativeA.id }),
      },
    );
    expect(duplicate.status).toBe(409);

    expect(prisma.getGrantsForOwner(owner.id)).toHaveLength(1);
  });

  it('rejects a second pending invite for the same user-owner pair until the old grant is disabled', async () => {
    const email = 'new-owner@test.com';
    const first = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email }),
      },
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const duplicatePending = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email: 'NEW-OWNER@test.com' }),
      },
    );
    expect(duplicatePending.status).toBe(409);

    const disable = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants/${firstBody.id}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({}),
      },
    );
    expect(disable.status).toBe(201);

    const createAfterDisable = await fetch(
      `${baseUrl}/org/owners/${owner.id}/access-grants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdmin.id,
        },
        body: JSON.stringify({ email }),
      },
    );
    expect(createAfterDisable.status).toBe(201);
  });
});

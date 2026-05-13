import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PlatformAuthGuard } from '../src/common/guards/platform-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthRepo } from '../src/modules/auth/auth.repo';
import { AuthService } from '../src/modules/auth/auth.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { AuthPasswordDeliveryService } from '../src/modules/auth/auth-password-delivery.service';
import { UserAccessProjectionService } from '../src/modules/access-control/user-access-projection.service';
import { PlatformOrgsController } from '../src/modules/platform/platform-orgs.controller';
import { PlatformOrgsService } from '../src/modules/platform/platform-orgs.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type OrgRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type RoleRecord = {
  id: string;
  orgId?: string | null;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PermissionRecord = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};

type RolePermissionRecord = {
  roleId: string;
  permissionId: string;
};

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  refreshTokenHash?: string | null;
  name?: string | null;
  orgId?: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type UserRoleRecord = {
  userId: string;
  roleId: string;
  createdAt: Date;
};

type UserAccessAssignmentRecord = {
  id: string;
  userId: string;
  roleTemplateId: string;
  scopeType: 'ORG' | 'BUILDING';
  scopeId: string | null;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private roles: RoleRecord[] = [];
  private permissions: PermissionRecord[] = [];
  private rolePermissions: RolePermissionRecord[] = [];
  private users: UserRecord[] = [];
  private userRoles: UserRoleRecord[] = [];
  private userAccessAssignments: UserAccessAssignmentRecord[] = [];

  org = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.orgs.find((org) => org.id === where.id) ?? null;
    },
    create: async ({ data }: { data: { name: string } }) => {
      const now = new Date();
      const org: OrgRecord = {
        id: randomUUID(),
        name: data.name,
        createdAt: now,
        updatedAt: now,
      };
      this.orgs.push(org);
      return org;
    },
  };

  role = {
    findUnique: async ({ where }: { where: { key: string } }) => {
      return this.roles.find((role) => role.key === where.key) ?? null;
    },
    findFirst: async ({
      where,
    }: {
      where: { key: string; orgId?: string | null };
    }) => {
      return (
        this.roles.find(
          (role) =>
            role.key === where.key &&
            (where.orgId === undefined ? true : role.orgId === where.orgId),
        ) ?? null
      );
    },
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { orgId_key: { orgId: string; key: string } };
      update: Partial<RoleRecord>;
      create: {
        orgId: string;
        key: string;
        name: string;
        description?: string | null;
        isSystem?: boolean;
      };
    }) => {
      const existing = this.roles.find(
        (role) =>
          role.key === where.orgId_key.key &&
          role.orgId === where.orgId_key.orgId,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const now = new Date();
      const role: RoleRecord = {
        id: randomUUID(),
        orgId: create.orgId,
        key: create.key,
        name: create.name,
        description: create.description ?? null,
        isSystem: create.isSystem ?? false,
        createdAt: now,
        updatedAt: now,
      };
      this.roles.push(role);
      return role;
    },
  };

  roleTemplate = {
    findFirst: async ({
      where,
    }: {
      where: { key: string; orgId?: string | null };
    }) => {
      return this.role.findFirst({ where });
    },
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { orgId_key: { orgId: string; key: string } };
      update: Partial<RoleRecord>;
      create: {
        orgId: string;
        key: string;
        name: string;
        description?: string | null;
        isSystem?: boolean;
      };
    }) => {
      return this.role.upsert({ where, update, create });
    },
  };

  user = {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; email?: string };
    }) => {
      if (where.id) {
        return this.users.find((user) => user.id === where.id) ?? null;
      }
      if (where.email) {
        return this.users.find((user) => user.email === where.email) ?? null;
      }
      return null;
    },
    findFirst: async ({
      where,
    }: {
      where: { email?: { equals: string; mode?: string } };
    }) => {
      const email = where.email?.equals?.toLowerCase();
      if (!email) {
        return null;
      }
      return (
        this.users.find((user) => user.email.toLowerCase() === email) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: {
        email: string;
        passwordHash: string;
        name?: string | null;
        orgId?: string | null;
        mustChangePassword?: boolean;
        isActive?: boolean;
      };
    }) => {
      const now = new Date();
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name ?? null,
        orgId: data.orgId ?? null,
        mustChangePassword: data.mustChangePassword ?? false,
        isActive: data.isActive ?? true,
        refreshTokenHash: null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(user);
      return user;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<UserRecord>;
    }) => {
      const user = this.users.find((record) => record.id === where.id);
      if (!user) {
        throw new Error('User not found');
      }
      if (data.email !== undefined) {
        user.email = data.email;
      }
      if (data.passwordHash !== undefined) {
        user.passwordHash = data.passwordHash;
      }
      if (data.refreshTokenHash !== undefined) {
        user.refreshTokenHash = data.refreshTokenHash;
      }
      if (data.name !== undefined) {
        user.name = data.name;
      }
      if (data.orgId !== undefined) {
        user.orgId = data.orgId;
      }
      if (data.mustChangePassword !== undefined) {
        user.mustChangePassword = data.mustChangePassword;
      }
      if (data.isActive !== undefined) {
        user.isActive = data.isActive;
      }
      user.updatedAt = new Date();
      return user;
    },
  };

  buildingAssignment = {
    findMany: async () => [],
  };

  userRole = {
    create: async ({ data }: { data: { userId: string; roleId: string } }) => {
      const record: UserRoleRecord = {
        userId: data.userId,
        roleId: data.roleId,
        createdAt: new Date(),
      };
      this.userRoles.push(record);
      return record;
    },
    findMany: async ({
      where,
      include,
    }: {
      where: { userId: string };
      include?: { role?: boolean };
    }) => {
      const results = this.userRoles.filter(
        (record) => record.userId === where.userId,
      );
      return results.map((record) => ({
        ...record,
        role: include?.role
          ? (this.roles.find((role) => role.id === record.roleId) ?? null)
          : undefined,
      }));
    },
  };

  permission = {
    findMany: async ({ where }: { where?: { key?: { in: string[] } } }) => {
      if (!where?.key?.in) {
        return this.permissions.slice();
      }
      return this.permissions.filter((permission) =>
        where.key!.in.includes(permission.key),
      );
    },
  };

  rolePermission = {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: { roleId: string; permissionId: string }[];
      skipDuplicates?: boolean;
    }) => {
      let created = 0;
      for (const entry of data) {
        const exists = this.rolePermissions.some(
          (record) =>
            record.roleId === entry.roleId &&
            record.permissionId === entry.permissionId,
        );
        if (exists && skipDuplicates) {
          continue;
        }
        this.rolePermissions.push({
          roleId: entry.roleId,
          permissionId: entry.permissionId,
        });
        created += 1;
      }
      return { count: created };
    },
  };

  roleTemplatePermission = {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: { roleTemplateId: string; permissionId: string }[];
      skipDuplicates?: boolean;
    }) => {
      return this.rolePermission.createMany({
        data: data.map((entry) => ({
          roleId: entry.roleTemplateId,
          permissionId: entry.permissionId,
        })),
        skipDuplicates,
      });
    },
  };

  userAccessAssignment = {
    upsert: async ({
      where,
      create,
    }: {
      where: { id: string };
      update: Record<string, never>;
      create: UserAccessAssignmentRecord;
    }) => {
      const existing = this.userAccessAssignments.find(
        (assignment) => assignment.id === where.id,
      );
      if (existing) {
        return existing;
      }

      const assignment: UserAccessAssignmentRecord = { ...create };
      this.userAccessAssignments.push(assignment);
      return assignment;
    },
  };

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]) {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg(this);
  }

  reset() {
    this.orgs = [];
    this.users = [];
    this.userRoles = [];
    this.userAccessAssignments = [];
    this.roles = [];
    this.permissions = [];
    this.rolePermissions = [];
  }

  seedOrgAdminRole() {
    const now = new Date();
    this.roles.push({
      id: randomUUID(),
      orgId: null,
      key: 'org_admin',
      name: 'Org Admin',
      description: 'Org administrator',
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userIdHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
    if (!userId) {
      return false;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return false;
    }
    request.user = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId ?? null,
    };
    return true;
  }
}

@Controller('org/test')
@UseGuards(JwtAuthGuard, OrgScopeGuard)
class TestOrgController {
  @Get()
  getStatus() {
    return { ok: true };
  }
}

describe('Platform org admin (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwtService: JwtService;
  let platformUser: UserRecord;

  const platformKey = process.env.PLATFORM_API_KEY ?? 'test-platform-key';
  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('token'),
      verifyAsync: jest.fn(),
    } as unknown as JwtService;

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformOrgsController, AuthController, TestOrgController],
      providers: [
        PlatformOrgsService,
        PlatformAuthGuard,
        AuthService,
        {
          provide: AuthPasswordDeliveryService,
          useValue: {
            enqueuePasswordResetEmail: jest.fn(),
          },
        },
        AuthRepo,
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (userId: string) =>
              permissionsByUser.get(userId) ?? new Set<string>(),
          },
        },
        {
          provide: UserAccessProjectionService,
          useValue: {
            buildUserResponse: async (user: UserRecord) => user,
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
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

  beforeEach(async () => {
    prisma.reset();
    prisma.seedOrgAdminRole();
    permissionsByUser.clear();

    platformUser = (await prisma.user.create({
      data: {
        email: 'platform@towerdesk.local',
        passwordHash: 'hash',
        orgId: null,
        name: 'Platform Admin',
        isActive: true,
      },
    })) as unknown as UserRecord;

    permissionsByUser.set(
      platformUser.id,
      new Set(['platform.org.create', 'platform.org.admin.create']),
    );

    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: platformUser.id,
      email: platformUser.email,
      orgId: null,
    });
  });

  it('rejects platform access without the platform key', async () => {
    const response = await fetch(`${baseUrl}/platform/orgs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Org' }),
    });

    expect(response.status).toBe(401);
  });

  it('creates an org admin and returns mustChangePassword on login', async () => {
    const orgResponse = await fetch(`${baseUrl}/platform/orgs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform-key': platformKey,
      },
      body: JSON.stringify({ name: 'Acme Org' }),
    });

    expect(orgResponse.status).toBe(201);
    const orgBody = await orgResponse.json();

    const adminResponse = await fetch(
      `${baseUrl}/platform/orgs/${orgBody.id}/admins`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-key': platformKey,
        },
        body: JSON.stringify({
          name: 'Org Admin',
          email: 'admin@acme.com',
        }),
      },
    );

    expect(adminResponse.status).toBe(201);
    const adminBody = await adminResponse.json();
    expect(adminBody.tempPassword).toBeTruthy();
    expect(adminBody.mustChangePassword).toBe(true);

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminBody.email,
        password: adminBody.tempPassword,
      }),
    });

    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.user.mustChangePassword).toBe(true);
  });

  it('rejects creating an org admin when the email belongs to another org user', async () => {
    const sourceOrg = await prisma.org.create({ data: { name: 'Source Org' } });
    await prisma.user.create({
      data: {
        email: 'shared-tenant@acme.com',
        passwordHash: 'hash',
        orgId: sourceOrg.id,
        name: 'Shared Tenant',
        isActive: true,
      },
    });

    const orgResponse = await fetch(`${baseUrl}/platform/orgs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform-key': platformKey,
      },
      body: JSON.stringify({ name: 'Target Org' }),
    });

    expect(orgResponse.status).toBe(201);
    const orgBody = await orgResponse.json();

    const adminResponse = await fetch(
      `${baseUrl}/platform/orgs/${orgBody.id}/admins`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-key': platformKey,
        },
        body: JSON.stringify({
          name: 'Org Admin',
          email: 'shared-tenant@acme.com',
        }),
      },
    );

    expect(adminResponse.status).toBe(409);
    await expect(adminResponse.json()).resolves.toMatchObject({
      message: 'Email already belongs to a user in another organization',
    });
  });

  it('allows platform access with a platform superadmin JWT', async () => {
    const response = await fetch(`${baseUrl}/platform/orgs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer platform-token',
      },
      body: JSON.stringify({ name: 'JWT Org' }),
    });

    expect(response.status).toBe(201);
  });

  it('blocks platform users from org-scoped routes', async () => {
    const response = await fetch(`${baseUrl}/org/test`, {
      headers: { 'x-user-id': platformUser.id },
    });

    expect(response.status).toBe(403);
  });

  it('clears mustChangePassword after change-password', async () => {
    const orgResponse = await fetch(`${baseUrl}/platform/orgs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform-key': platformKey,
      },
      body: JSON.stringify({ name: 'Bravo Org' }),
    });

    const orgBody = await orgResponse.json();
    const adminResponse = await fetch(
      `${baseUrl}/platform/orgs/${orgBody.id}/admins`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-key': platformKey,
        },
        body: JSON.stringify({
          name: 'Org Admin',
          email: 'admin@bravo.com',
        }),
      },
    );

    const adminBody = await adminResponse.json();

    const changeResponse = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': adminBody.userId,
      },
      body: JSON.stringify({
        currentPassword: adminBody.tempPassword,
        newPassword: 'NewPassword123!',
      }),
    });

    expect(changeResponse.status).toBe(200);

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminBody.email,
        password: 'NewPassword123!',
      }),
    });

    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.user.mustChangePassword).toBe(false);
  });
});

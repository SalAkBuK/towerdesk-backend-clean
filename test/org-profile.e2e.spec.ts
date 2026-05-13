import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { BuildingScopeResolverService } from '../src/common/building-access/building-scope-resolver.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { StorageService } from '../src/infra/storage/storage.service';
import { OrgProfileController } from '../src/modules/org-profile/org-profile.controller';
import { OrgProfileService } from '../src/modules/org-profile/org-profile.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { OrgUserLifecycleService } from '../src/modules/users/org-user-lifecycle.service';
import { UsersRepo } from '../src/modules/users/users.repo';

type OrgRecord = {
  id: string;
  name: string;
  logoUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  refreshTokenHash?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  orgId?: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string; logoUrl?: string } }) => {
      const now = new Date();
      const org: OrgRecord = {
        id: randomUUID(),
        name: data.name,
        logoUrl: data.logoUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.orgs.push(org);
      return org;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.orgs.find((org) => org.id === where.id) ?? null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { name?: string; logoUrl?: string | null };
    }) => {
      const org = this.orgs.find((record) => record.id === where.id);
      if (!org) {
        throw new Error('Org not found');
      }
      if (data.name !== undefined) {
        org.name = data.name;
      }
      if (data.logoUrl !== undefined) {
        org.logoUrl = data.logoUrl;
      }
      org.updatedAt = new Date();
      return org;
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
    create: async ({
      data,
    }: {
      data: {
        email: string;
        passwordHash: string;
        name?: string | null;
        avatarUrl?: string | null;
        phone?: string | null;
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
        avatarUrl: data.avatarUrl ?? null,
        phone: data.phone ?? null,
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
      data: {
        name?: string | null;
        avatarUrl?: string | null;
        phone?: string | null;
      };
    }) => {
      const user = this.users.find((record) => record.id === where.id);
      if (!user) {
        throw new Error('User not found');
      }
      if (data.name !== undefined) {
        user.name = data.name;
      }
      if (data.avatarUrl !== undefined) {
        user.avatarUrl = data.avatarUrl;
      }
      if (data.phone !== undefined) {
        user.phone = data.phone;
      }
      user.updatedAt = new Date();
      return user;
    },
  };

  userRole = {
    findMany: async () => {
      return [];
    },
  };

  reset() {
    this.orgs = [];
    this.users = [];
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

describe('Org and user profile (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgA: OrgRecord;
  let orgB: OrgRecord;
  let orgAdminA: UserRecord;
  let userA: UserRecord;
  let orgAdminB: UserRecord;
  let storageService: {
    putObject: jest.Mock;
    getPublicUrl: jest.Mock;
  };

  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();
    storageService = {
      putObject: jest.fn().mockResolvedValue(undefined),
      getPublicUrl: jest.fn(
        ({ key }: { key: string }) => `https://cdn.test/${key}`,
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrgProfileController, UsersController],
      providers: [
        OrgProfileService,
        UsersService,
        UsersRepo,
        OrgScopeGuard,
        PermissionsGuard,
        {
          provide: BuildingScopeResolverService,
          useValue: {
            resolveForRequest: async () => undefined,
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (userId: string) =>
              permissionsByUser.get(userId) ?? new Set<string>(),
          },
        },
        {
          provide: OrgUserLifecycleService,
          useValue: {
            buildUserResponse: async (user: UserRecord) => user,
            buildUserResponseInOrg: async (id: string) =>
              prisma.user.findUnique({ where: { id } }),
            listUserResponsesInOrg: async (orgId: string) =>
              (
                prisma as unknown as {
                  users: UserRecord[];
                }
              ).users.filter((user) => user.orgId === orgId),
            provisionOrgUser: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storageService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
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
    permissionsByUser.clear();
    storageService.putObject.mockClear();
    storageService.getPublicUrl.mockClear();

    orgA = await prisma.org.create({
      data: { name: 'Org A', logoUrl: 'https://img.test/org-a.png' },
    });
    orgB = await prisma.org.create({
      data: { name: 'Org B', logoUrl: 'https://img.test/org-b.png' },
    });

    orgAdminA = await prisma.user.create({
      data: {
        email: 'admin-a@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Org Admin A',
        isActive: true,
      },
    });
    userA = await prisma.user.create({
      data: {
        email: 'user-a@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'User A',
        isActive: true,
      },
    });
    orgAdminB = await prisma.user.create({
      data: {
        email: 'admin-b@org.test',
        passwordHash: 'hash',
        orgId: orgB.id,
        name: 'Org Admin B',
        isActive: true,
      },
    });

    permissionsByUser.set(orgAdminA.id, new Set(['org.profile.write']));
    permissionsByUser.set(orgAdminB.id, new Set(['org.profile.write']));
  });

  it('allows any org user to read org profile', async () => {
    const response = await fetch(`${baseUrl}/org/profile`, {
      headers: { 'x-user-id': userA.id },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(orgA.id);
    expect(body.logoUrl).toBe('https://img.test/org-a.png');
  });

  it('allows org admins to update org profile', async () => {
    const response = await fetch(`${baseUrl}/org/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAdminA.id,
      },
      body: JSON.stringify({
        name: 'Org A Updated',
        logoUrl: 'https://img.test/org-a-new.png',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe('Org A Updated');
  });

  it('blocks non-admin org profile updates', async () => {
    const response = await fetch(`${baseUrl}/org/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userA.id,
      },
      body: JSON.stringify({ name: 'Nope' }),
    });

    expect(response.status).toBe(403);
  });

  it('updates user self profile without affecting other users', async () => {
    const response = await fetch(`${baseUrl}/users/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userA.id,
      },
      body: JSON.stringify({
        name: 'User A Updated',
        avatarUrl: 'https://img.test/avatar.png',
        phone: '+1234567890',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe('User A Updated');
    expect(body.avatarUrl).toBe('https://img.test/avatar.png');
    expect(body.phone).toBe('+1234567890');

    const meResponse = await fetch(`${baseUrl}/users/me`, {
      headers: { 'x-user-id': userA.id },
    });
    const meBody = await meResponse.json();
    expect(meBody.avatarUrl).toBe('https://img.test/avatar.png');

    const otherResponse = await fetch(`${baseUrl}/users/me`, {
      headers: { 'x-user-id': orgAdminA.id },
    });
    const otherBody = await otherResponse.json();
    expect(otherBody.id).toBe(orgAdminA.id);
  });

  it('updates org profile only for the caller org', async () => {
    const response = await fetch(`${baseUrl}/org/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': orgAdminB.id,
      },
      body: JSON.stringify({ name: 'Org B Updated' }),
    });

    expect(response.status).toBe(200);

    const orgAResponse = await fetch(`${baseUrl}/org/profile`, {
      headers: { 'x-user-id': orgAdminA.id },
    });
    const orgABody = await orgAResponse.json();
    expect(orgABody.name).toBe('Org A');
  });

  it('uploads avatar for the authenticated user and returns it on /users/me', async () => {
    const form = new FormData();
    form.set(
      'file',
      new Blob(['avatar-binary'], { type: 'image/png' }),
      'staff-avatar.png',
    );

    const uploadResponse = await fetch(`${baseUrl}/users/me/avatar`, {
      method: 'POST',
      headers: { 'x-user-id': userA.id },
      body: form,
    });

    expect(uploadResponse.status).toBe(200);
    const uploadBody = await uploadResponse.json();
    expect(uploadBody.avatarUrl).toMatch(
      new RegExp(`^https://cdn\\.test/avatars/${orgA.id}/${userA.id}/`),
    );
    expect(storageService.putObject).toHaveBeenCalledTimes(1);

    const meResponse = await fetch(`${baseUrl}/users/me`, {
      headers: { 'x-user-id': userA.id },
    });
    expect(meResponse.status).toBe(200);
    const meBody = await meResponse.json();
    expect(meBody.avatarUrl).toBe(uploadBody.avatarUrl);
  });

  it('rejects unsupported avatar mime types for user self upload', async () => {
    const form = new FormData();
    form.set(
      'file',
      new Blob(['svg'], { type: 'image/svg+xml' }),
      'avatar.svg',
    );

    const response = await fetch(`${baseUrl}/users/me/avatar`, {
      method: 'POST',
      headers: { 'x-user-id': userA.id },
      body: form,
    });

    expect(response.status).toBe(400);
    expect(storageService.putObject).not.toHaveBeenCalled();
  });
});

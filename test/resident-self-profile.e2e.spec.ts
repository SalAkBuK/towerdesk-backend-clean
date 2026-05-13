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
import { ResidentProfileController } from '../src/modules/residents/resident-profile.controller';
import { ResidentProfilesService } from '../src/modules/residents/resident-profiles.service';
import { ResidentProfilesRepo } from '../src/modules/residents/resident-profiles.repo';
import { ResidentsService } from '../src/modules/residents/residents.service';

type OrgRecord = {
  id: string;
  name: string;
};

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const org: OrgRecord = { id: randomUUID(), name: data.name };
      this.orgs.push(org);
      return org;
    },
  };

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((user) => user.id === where.id) ?? null;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where: { id: string; orgId: string };
      select?: Record<string, boolean>;
    }) => {
      const user =
        this.users.find(
          (record) => record.id === where.id && record.orgId === where.orgId,
        ) ?? null;
      if (!user || !select) {
        return user;
      }

      return Object.fromEntries(
        Object.entries(select)
          .filter(([, enabled]) => enabled)
          .map(([key]) => [key, user[key as keyof UserRecord] ?? null]),
      );
    },
    create: async ({
      data,
    }: {
      data: {
        email: string;
        orgId: string;
        isActive: boolean;
        name?: string | null;
        phone?: string | null;
        avatarUrl?: string | null;
      };
    }) => {
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        isActive: data.isActive,
        name: data.name ?? null,
        phone: data.phone ?? null,
        avatarUrl: data.avatarUrl ?? null,
      };
      this.users.push(user);
      return user;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { avatarUrl?: string | null };
    }) => {
      const user = this.users.find((record) => record.id === where.id);
      if (!user) {
        throw new Error('User not found');
      }
      if (data.avatarUrl !== undefined) {
        user.avatarUrl = data.avatarUrl;
      }
      return user;
    },
  };

  residentProfile = {
    findFirst: async () => null,
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

describe('Resident self profile (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgA: OrgRecord;
  let userA: UserRecord;
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
      controllers: [ResidentProfileController],
      providers: [
        ResidentProfilesService,
        ResidentProfilesRepo,
        OrgScopeGuard,
        PermissionsGuard,
        {
          provide: ResidentsService,
          useValue: {
            getCurrentResidentProfile: async (user: { sub: string }) => {
              const residentUser = await prisma.user.findUnique({
                where: { id: user.sub },
              });
              return { user: residentUser, occupancy: null };
            },
          },
        },
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

    orgA = await prisma.org.create({ data: { name: 'Org A' } });
    userA = await prisma.user.create({
      data: {
        email: 'resident-a@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident A',
      },
    });
  });

  it('uploads avatar for the authenticated resident and returns it on /resident/me', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['resident.profile.read', 'resident.profile.write']),
    );

    const form = new FormData();
    form.set(
      'file',
      new Blob(['avatar-binary'], { type: 'image/png' }),
      'tenant-avatar.png',
    );

    const uploadResponse = await fetch(`${baseUrl}/resident/me/avatar`, {
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

    const meResponse = await fetch(`${baseUrl}/resident/me`, {
      headers: { 'x-user-id': userA.id },
    });

    expect(meResponse.status).toBe(200);
    const meBody = await meResponse.json();
    expect(meBody.user.id).toBe(userA.id);
    expect(meBody.user.avatarUrl).toBe(uploadBody.avatarUrl);
    expect(meBody.occupancy).toBeNull();
  });

  it('rejects unsupported avatar mime types', async () => {
    permissionsByUser.set(userA.id, new Set(['resident.profile.write']));

    const form = new FormData();
    form.set(
      'file',
      new Blob(['svg'], { type: 'image/svg+xml' }),
      'avatar.svg',
    );

    const response = await fetch(`${baseUrl}/resident/me/avatar`, {
      method: 'POST',
      headers: { 'x-user-id': userA.id },
      body: form,
    });

    expect(response.status).toBe(400);
    expect(storageService.putObject).not.toHaveBeenCalled();
  });
});

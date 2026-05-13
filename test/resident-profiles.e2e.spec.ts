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
import { ResidentProfilesController } from '../src/modules/residents/resident-profiles.controller';
import { ResidentProfilesService } from '../src/modules/residents/resident-profiles.service';
import { ResidentProfilesRepo } from '../src/modules/residents/resident-profiles.repo';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { StorageService } from '../src/infra/storage/storage.service';

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

type ResidentProfileRecord = {
  id: string;
  orgId: string;
  userId: string;
  emiratesIdNumber?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  dateOfBirth?: Date | null;
  currentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private profiles: ResidentProfileRecord[] = [];

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
    findFirst: async ({ where }: { where: { id: string; orgId: string } }) => {
      return (
        this.users.find(
          (user) => user.id === where.id && user.orgId === where.orgId,
        ) ?? null
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
  };

  residentProfile = {
    findFirst: async ({
      where,
      include,
    }: {
      where: { orgId: string; userId: string };
      include?: { user?: { select?: Record<string, boolean> } };
    }) => {
      const profile =
        this.profiles.find(
          (profile) =>
            profile.orgId === where.orgId && profile.userId === where.userId,
        ) ?? null;
      if (!profile) {
        return null;
      }
      if (include?.user) {
        const user = this.users.find((u) => u.id === profile.userId) ?? null;
        return { ...profile, user };
      }
      return profile;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: Omit<ResidentProfileRecord, 'id' | 'createdAt' | 'updatedAt'>;
      update: Partial<ResidentProfileRecord>;
    }) => {
      const existing = this.profiles.find(
        (profile) => profile.userId === where.userId,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }

      const now = new Date();
      const profile: ResidentProfileRecord = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...create,
      };
      this.profiles.push(profile);
      return profile;
    },
  };

  reset() {
    this.orgs = [];
    this.users = [];
    this.profiles = [];
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

describe('Resident profiles (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgA: OrgRecord;
  let orgB: OrgRecord;
  let userA: UserRecord;
  let userB: UserRecord;

  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [ResidentProfilesController],
      providers: [
        ResidentProfilesService,
        ResidentProfilesRepo,
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
        { provide: PrismaService, useValue: prisma },
        {
          provide: StorageService,
          useValue: {
            putObject: jest.fn(),
            getPublicUrl: jest.fn(),
          },
        },
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

    orgA = await prisma.org.create({ data: { name: 'Org A' } });
    orgB = await prisma.org.create({ data: { name: 'Org B' } });
    userA = await prisma.user.create({
      data: {
        email: 'user-a@org.test',
        orgId: orgA.id,
        isActive: true,
      },
    });
    userB = await prisma.user.create({
      data: {
        email: 'user-b@org.test',
        orgId: orgB.id,
        isActive: true,
      },
    });
  });

  it('rejects reads without residents.profile.read permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/residents/${userA.id}/profile`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 when profile is missing', async () => {
    permissionsByUser.set(userA.id, new Set(['residents.profile.read']));

    const response = await fetch(
      `${baseUrl}/org/residents/${userA.id}/profile`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(404);
  });

  it('rejects writes without residents.profile.write permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/residents/${userA.id}/profile`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({
          nationality: 'UAE',
        }),
      },
    );

    expect(response.status).toBe(403);
  });

  it('allows upsert with write permission and returns profile', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['residents.profile.read', 'residents.profile.write']),
    );

    const upsert = await fetch(`${baseUrl}/org/residents/${userA.id}/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userA.id,
      },
      body: JSON.stringify({
        nationality: 'UAE',
        emergencyContactName: 'Jane Doe',
      }),
    });

    expect(upsert.status).toBe(200);
    const upsertBody = await upsert.json();
    expect(upsertBody.userId).toBe(userA.id);
    expect(upsertBody.nationality).toBe('UAE');
    expect(upsertBody.user.email).toBe(userA.email);
    expect(upsertBody.user.avatarUrl ?? null).toBe(userA.avatarUrl ?? null);

    const read = await fetch(`${baseUrl}/org/residents/${userA.id}/profile`, {
      headers: { 'x-user-id': userA.id },
    });

    expect(read.status).toBe(200);
    const readBody = await read.json();
    expect(readBody.userId).toBe(userA.id);
    expect(readBody.emergencyContactName).toBe('Jane Doe');
    expect(readBody.user.email).toBe(userA.email);
    expect(readBody.user.avatarUrl ?? null).toBe(userA.avatarUrl ?? null);
  });

  it('hides profiles across orgs', async () => {
    permissionsByUser.set(userA.id, new Set(['residents.profile.read']));

    const response = await fetch(
      `${baseUrl}/org/residents/${userB.id}/profile`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(404);
  });
});

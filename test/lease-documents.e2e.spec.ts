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
import { LeasesRepo } from '../src/modules/leases/leases.repo';
import { LeaseActivityRepo } from '../src/modules/leases/lease-activity.repo';
import { LeaseDocumentsRepo } from '../src/modules/leases/lease-documents.repo';
import { LeaseDocumentsService } from '../src/modules/leases/lease-documents.service';
import { LeaseDocumentsController } from '../src/modules/leases/lease-documents.controller';
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
};

type LeaseRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId: string;
  occupancyId: string;
  status: 'ACTIVE' | 'ENDED';
  leaseStartDate: Date;
  leaseEndDate: Date;
  annualRent: string;
  paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  securityDepositAmount: string;
};

type LeaseDocumentRecord = {
  id: string;
  leaseId: string;
  orgId: string;
  type:
    | 'EMIRATES_ID_COPY'
    | 'PASSPORT_COPY'
    | 'SIGNED_TENANCY_CONTRACT'
    | 'CHEQUE_COPY'
    | 'OTHER';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
};

type LeaseActivityRecord = {
  id: string;
  orgId: string;
  leaseId: string;
  action: string;
  source: 'USER' | 'SYSTEM';
  changedByUserId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private leases: LeaseRecord[] = [];
  private documents: LeaseDocumentRecord[] = [];
  private leaseActivities: LeaseActivityRecord[] = [];

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
    create: async ({
      data,
    }: {
      data: { email: string; orgId: string; isActive: boolean };
    }) => {
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        isActive: data.isActive,
      };
      this.users.push(user);
      return user;
    },
  };

  lease = {
    create: async ({ data }: { data: LeaseRecord }) => {
      const lease: LeaseRecord = { ...data };
      this.leases.push(lease);
      return lease;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; orgId?: string };
    }) => {
      return (
        this.leases.find((lease) => {
          if (where.id && lease.id !== where.id) {
            return false;
          }
          if (where.orgId && lease.orgId !== where.orgId) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
  };

  leaseDocument = {
    findMany: async ({
      where,
    }: {
      where: { orgId: string; leaseId: string };
    }) => {
      return this.documents.filter(
        (doc) => doc.orgId === where.orgId && doc.leaseId === where.leaseId,
      );
    },
    create: async ({
      data,
    }: {
      data: Omit<LeaseDocumentRecord, 'id' | 'createdAt'>;
    }) => {
      const now = new Date();
      const document: LeaseDocumentRecord = {
        id: randomUUID(),
        createdAt: now,
        ...data,
      };
      this.documents.push(document);
      return document;
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; orgId: string; leaseId: string };
    }) => {
      return (
        this.documents.find(
          (doc) =>
            doc.id === where.id &&
            doc.orgId === where.orgId &&
            doc.leaseId === where.leaseId,
        ) ?? null
      );
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.documents.findIndex((doc) => doc.id === where.id);
      if (index === -1) {
        throw new Error('Document not found');
      }
      const [removed] = this.documents.splice(index, 1);
      return removed;
    },
  };

  leaseActivity = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        leaseId: string;
        action: string;
        source?: 'USER' | 'SYSTEM';
        changedByUserId?: string | null;
        payload: Record<string, unknown>;
      };
    }) => {
      const record: LeaseActivityRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        source: data.source ?? 'USER',
        changedByUserId: data.changedByUserId ?? null,
        payload: data.payload,
        createdAt: new Date(),
      };
      this.leaseActivities.push(record);
      return record;
    },
  };

  reset() {
    this.orgs = [];
    this.users = [];
    this.leases = [];
    this.documents = [];
    this.leaseActivities = [];
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

describe('Lease documents (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgA: OrgRecord;
  let orgB: OrgRecord;
  let userA: UserRecord;
  let leaseA: LeaseRecord;
  let leaseB: LeaseRecord;

  const permissionsByUser = new Map<string, Set<string>>();

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [LeaseDocumentsController],
      providers: [
        LeaseDocumentsService,
        LeaseDocumentsRepo,
        LeaseActivityRepo,
        LeasesRepo,
        OrgScopeGuard,
        PermissionsGuard,
        {
          provide: StorageService,
          useValue: {
            getSignedUrl: async ({ key }: { key: string }) =>
              `https://signed.test/${key}`,
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
      data: { email: 'user-a@org.test', orgId: orgA.id, isActive: true },
    });
    await prisma.user.create({
      data: { email: 'user-b@org.test', orgId: orgB.id, isActive: true },
    });

    leaseA = await prisma.lease.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        buildingId: randomUUID(),
        unitId: randomUUID(),
        occupancyId: randomUUID(),
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '120000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '5000.00',
      },
    });
    leaseB = await prisma.lease.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        buildingId: randomUUID(),
        unitId: randomUUID(),
        occupancyId: randomUUID(),
        status: 'ACTIVE',
        leaseStartDate: new Date('2025-01-01T00:00:00.000Z'),
        leaseEndDate: new Date('2026-01-01T00:00:00.000Z'),
        annualRent: '130000.00',
        paymentFrequency: 'ANNUAL',
        securityDepositAmount: '6000.00',
      },
    });
  });

  it('rejects reads without leases.documents.read permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/documents`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 when lease is outside org', async () => {
    permissionsByUser.set(userA.id, new Set(['leases.documents.read']));

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseB.id}/documents`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(404);
  });

  it('returns empty list when no documents exist', async () => {
    permissionsByUser.set(userA.id, new Set(['leases.documents.read']));

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/documents`,
      { headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('rejects writes without leases.documents.write permission', async () => {
    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/documents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userA.id,
        },
        body: JSON.stringify({
          type: 'OTHER',
          fileName: 'lease.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1000,
          url: 'https://files.test/lease.pdf',
        }),
      },
    );

    expect(response.status).toBe(403);
  });

  it('creates and lists documents with write permission', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.documents.read', 'leases.documents.write']),
    );

    const create = await fetch(`${baseUrl}/org/leases/${leaseA.id}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userA.id,
      },
      body: JSON.stringify({
        type: 'SIGNED_TENANCY_CONTRACT',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2000,
        url: 'https://files.test/contract.pdf',
      }),
    });

    expect(create.status).toBe(200);
    const createdBody = await create.json();
    expect(createdBody.leaseId).toBe(leaseA.id);

    const list = await fetch(`${baseUrl}/org/leases/${leaseA.id}/documents`, {
      headers: { 'x-user-id': userA.id },
    });

    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody).toHaveLength(1);
    expect(listBody[0].id).toBe(createdBody.id);
  });

  it('rejects deletes without leases.documents.write permission', async () => {
    permissionsByUser.set(userA.id, new Set(['leases.documents.read']));

    const created = await prisma.leaseDocument.create({
      data: {
        leaseId: leaseA.id,
        orgId: orgA.id,
        type: 'OTHER',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        url: 'https://files.test/doc.pdf',
      },
    });

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/documents/${created.id}`,
      { method: 'DELETE', headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(403);
  });

  it('deletes documents with write permission', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.documents.read', 'leases.documents.write']),
    );

    const created = await prisma.leaseDocument.create({
      data: {
        leaseId: leaseA.id,
        orgId: orgA.id,
        type: 'OTHER',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        url: 'https://files.test/doc.pdf',
      },
    });

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseA.id}/documents/${created.id}`,
      { method: 'DELETE', headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(204);

    const list = await fetch(`${baseUrl}/org/leases/${leaseA.id}/documents`, {
      headers: { 'x-user-id': userA.id },
    });

    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody).toEqual([]);
  });

  it('prevents deleting a document from another lease', async () => {
    permissionsByUser.set(
      userA.id,
      new Set(['leases.documents.read', 'leases.documents.write']),
    );

    const created = await prisma.leaseDocument.create({
      data: {
        leaseId: leaseA.id,
        orgId: orgA.id,
        type: 'OTHER',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        url: 'https://files.test/doc.pdf',
      },
    });

    const response = await fetch(
      `${baseUrl}/org/leases/${leaseB.id}/documents/${created.id}`,
      { method: 'DELETE', headers: { 'x-user-id': userA.id } },
    );

    expect(response.status).toBe(404);
  });
});

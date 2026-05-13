import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  LeaseStatus,
  MoveRequestStatus,
  PaymentFrequency,
} from '@prisma/client';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { BuildingScopeResolverService } from '../src/common/building-access/building-scope-resolver.service';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { ContractsController } from '../src/modules/leases/contracts.controller';
import { ContractsService } from '../src/modules/leases/contracts.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
};

type BuildingAssignmentRecord = {
  buildingId: string;
  userId: string;
  type: 'MANAGER' | 'STAFF' | 'BUILDING_ADMIN';
};

let prisma: InMemoryPrismaService;
const orgId = '11111111-1111-4111-8111-111111111111';
const buildingId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';
const residentUserId = '44444444-4444-4444-8444-444444444444';

class InMemoryPrismaService {
  users: UserRecord[] = [];
  buildings: BuildingRecord[] = [];
  assignments: BuildingAssignmentRecord[] = [];

  reset() {
    this.users = [];
    this.buildings = [];
    this.assignments = [];
  }

  user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.users.find((user) => user.id === where.id) ?? null,
  };

  building = {
    findFirst: async ({ where }: { where: { id?: string; orgId?: string } }) =>
      this.buildings.find((building) => {
        if (where.id && building.id !== where.id) {
          return false;
        }
        if (where.orgId && building.orgId !== where.orgId) {
          return false;
        }
        return true;
      }) ?? null,
  };

  buildingAssignment = {
    findMany: async ({
      where,
    }: {
      where: { buildingId: string; userId: string };
    }) =>
      this.assignments.filter(
        (assignment) =>
          assignment.buildingId === where.buildingId &&
          assignment.userId === where.userId,
      ),
  };
}

@Injectable()
class TestAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { sub: string; email: string; orgId: string | null };
    }>();
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
      orgId: user.orgId,
    };
    return true;
  }
}

describe('ContractsController RBAC (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let managerId: string;
  let buildingAdminId: string;
  let orgAdminId: string;
  let plainUserId: string;

  const permissionsByUser = new Map<string, Set<string>>();

  const contractsServiceMock = {
    createDraftContract: jest.fn(),
    listMoveInRequests: jest.fn(),
    approveMoveInRequest: jest.fn(),
  };

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    contractsServiceMock.createDraftContract.mockImplementation(
      async (
        _user: unknown,
        targetBuildingId: string,
        dto: { unitId: string; residentUserId: string },
      ) => makeContract(targetBuildingId, dto.unitId, dto.residentUserId),
    );
    contractsServiceMock.listMoveInRequests.mockResolvedValue([
      makeMoveRequest(),
    ]);
    contractsServiceMock.approveMoveInRequest.mockResolvedValue(
      makeMoveRequest(MoveRequestStatus.APPROVED),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [
        OrgScopeGuard,
        PermissionsGuard,
        BuildingAccessGuard,
        BuildingAccessService,
        {
          provide: BuildingScopeResolverService,
          useValue: {
            resolveForRequest: async (request: {
              params?: { buildingId?: string };
              body?: { buildingId?: string };
            }) => request.params?.buildingId ?? request.body?.buildingId,
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (
              userId: string,
              scope?: { buildingId?: string },
            ) => {
              const effective =
                permissionsByUser.get(userId) ?? new Set<string>();
              if (!scope?.buildingId || userId === orgAdminId) {
                return effective;
              }

              const isAssigned = prisma.assignments.some(
                (assignment) =>
                  assignment.userId === userId &&
                  assignment.buildingId === scope.buildingId,
              );

              return isAssigned ? effective : new Set<string>();
            },
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: ContractsService, useValue: contractsServiceMock },
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

  beforeEach(() => {
    prisma.reset();
    permissionsByUser.clear();
    jest.clearAllMocks();

    prisma.buildings.push({
      id: buildingId,
      orgId,
      name: 'Alpha Tower',
    });

    managerId = seedUser(
      '55555555-5555-4555-8555-555555555555',
      'manager@org.test',
    );
    buildingAdminId = seedUser(
      '66666666-6666-4666-8666-666666666666',
      'building-admin@org.test',
    );
    orgAdminId = seedUser(
      '77777777-7777-4777-8777-777777777777',
      'org-admin@org.test',
    );
    plainUserId = seedUser(
      '88888888-8888-4888-8888-888888888888',
      'plain@org.test',
    );
    seedUser(residentUserId, 'resident@org.test');

    prisma.assignments.push(
      {
        buildingId,
        userId: managerId,
        type: 'MANAGER',
      },
      {
        buildingId,
        userId: buildingAdminId,
        type: 'BUILDING_ADMIN',
      },
    );
  });

  it('allows building admin to create a contract without org-wide contract permission', async () => {
    permissionsByUser.set(buildingAdminId, new Set(['contracts.write']));

    const response = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/contracts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': buildingAdminId,
        },
        body: JSON.stringify(makeCreateContractPayload()),
      },
    );

    expect(response.status).toBe(201);
    expect(contractsServiceMock.createDraftContract).toHaveBeenCalledWith(
      expect.objectContaining({ sub: buildingAdminId }),
      buildingId,
      expect.objectContaining({ unitId, residentUserId }),
    );
  });

  it('allows org user with contracts.write to create a contract without building assignment', async () => {
    permissionsByUser.set(orgAdminId, new Set(['contracts.write']));

    const response = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/contracts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdminId,
        },
        body: JSON.stringify(makeCreateContractPayload()),
      },
    );

    expect(response.status).toBe(201);
  });

  it('keeps owner identity on contracts as snapshot fields (not live owner identity)', async () => {
    permissionsByUser.set(orgAdminId, new Set(['contracts.write']));
    contractsServiceMock.createDraftContract.mockResolvedValueOnce({
      ...makeContract(buildingId, unitId, residentUserId),
      ownerNameSnapshot: 'Snapshot Owner',
      landlordNameSnapshot: 'Snapshot Landlord',
      landlordEmailSnapshot: 'landlord.snapshot@org.test',
      landlordPhoneSnapshot: '+971500000999',
    });

    const response = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/contracts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': orgAdminId,
        },
        body: JSON.stringify(makeCreateContractPayload()),
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerNameSnapshot).toBe('Snapshot Owner');
    expect(body.landlordNameSnapshot).toBe('Snapshot Landlord');
    expect(body.landlordEmailSnapshot).toBe('landlord.snapshot@org.test');
    expect(body.landlordPhoneSnapshot).toBe('+971500000999');
    expect(body).not.toHaveProperty('partyId');
    expect(body).not.toHaveProperty('liveOwner');
    expect(body).not.toHaveProperty('ownerPartyId');
  });

  it('allows assigned manager to list move-in requests without org-wide review permission', async () => {
    permissionsByUser.set(
      managerId,
      new Set(['contracts.move_requests.review']),
    );

    const response = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/move-in-requests`,
      {
        headers: { 'x-user-id': managerId },
      },
    );

    expect(response.status).toBe(200);
    expect(contractsServiceMock.listMoveInRequests).toHaveBeenCalledWith(
      expect.objectContaining({ sub: managerId }),
      buildingId,
      expect.any(Object),
    );
  });

  it('still requires explicit review permission for move-in approval', async () => {
    const response = await fetch(
      `${baseUrl}/org/move-in-requests/request-1/approve`,
      {
        method: 'POST',
        headers: { 'x-user-id': managerId },
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: 'Missing required permissions',
      statusCode: 403,
    });
    expect(contractsServiceMock.approveMoveInRequest).not.toHaveBeenCalled();
  });

  it('denies move-in request listing for plain org user without permission or assignment', async () => {
    const response = await fetch(
      `${baseUrl}/org/buildings/${buildingId}/move-in-requests`,
      {
        headers: { 'x-user-id': plainUserId },
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: 'Forbidden',
      statusCode: 403,
    });
  });

  function seedUser(id: string, email: string) {
    prisma.users.push({
      id,
      email,
      orgId,
      isActive: true,
    });
    return id;
  }
});

function makeCreateContractPayload() {
  return {
    unitId,
    residentUserId,
    contractPeriodFrom: '2026-03-10T00:00:00.000Z',
    contractPeriodTo: '2027-03-09T23:59:59.000Z',
    annualRent: '48000.00',
    paymentFrequency: PaymentFrequency.QUARTERLY,
    securityDepositAmount: '5000.00',
  };
}

function makeContract(
  buildingId: string,
  unitId: string,
  residentUserId: string,
) {
  return {
    id: randomUUID(),
    orgId,
    buildingId,
    unitId,
    occupancyId: null,
    residentUserId,
    status: LeaseStatus.DRAFT,
    leaseStartDate: new Date('2026-03-10T00:00:00.000Z'),
    leaseEndDate: new Date('2027-03-09T23:59:59.000Z'),
    annualRent: '48000.00',
    paymentFrequency: PaymentFrequency.QUARTERLY,
    numberOfCheques: null,
    securityDepositAmount: '5000.00',
    contractValue: null,
    paymentModeText: null,
    ijariId: null,
    contractDate: null,
    propertyUsage: null,
    ownerNameSnapshot: null,
    landlordNameSnapshot: null,
    tenantNameSnapshot: null,
    tenantEmailSnapshot: null,
    landlordEmailSnapshot: null,
    tenantPhoneSnapshot: null,
    landlordPhoneSnapshot: null,
    buildingNameSnapshot: null,
    locationCommunity: null,
    propertySizeSqm: null,
    propertyTypeLabel: null,
    propertyNumber: null,
    premisesNoDewa: null,
    plotNo: null,
    additionalTerms: [],
    createdAt: new Date('2026-03-09T00:00:00.000Z'),
    updatedAt: new Date('2026-03-09T00:00:00.000Z'),
    residentUser: null,
    occupancy: null,
    unit: {
      id: unitId,
      label: 'A-101',
      floor: null,
      bedrooms: null,
      bathrooms: null,
      unitSize: null,
      unitSizeUnit: null,
      furnishedStatus: null,
      unitType: null,
    },
  };
}

function makeMoveRequest(
  status: MoveRequestStatus = MoveRequestStatus.PENDING,
) {
  return {
    id: 'request-1',
    leaseId: 'lease-1',
    residentUserId,
    buildingId,
    unitId,
    status,
    requestedMoveAt: new Date('2026-03-15T10:00:00.000Z'),
    notes: null,
    reviewedByUserId: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: new Date('2026-03-09T11:00:00.000Z'),
    updatedAt: new Date('2026-03-09T11:00:00.000Z'),
  };
}

import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  LeaseDocumentType,
  LeaseStatus,
  MoveRequestStatus,
} from '@prisma/client';
import { NotificationTypeEnum } from '../notifications/notifications.constants';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { UnitsRepo } from '../units/units.repo';
import { LeaseActivityRepo } from './lease-activity.repo';
import { LeaseDocumentsService } from './lease-documents.service';
import { LeaseHistoryRepo } from './lease-history.repo';
import { LeaseLifecycleService } from './lease-lifecycle.service';
import { ContractsService } from './contracts.service';
import { StorageService } from '../../infra/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ContractsService (resident summary and request gating)', () => {
  let prisma: PrismaService;
  let leaseFindFirst: jest.Mock;
  let leaseFindMany: jest.Mock;
  let leaseUpdate: jest.Mock;
  let occupancyFindFirst: jest.Mock;
  let occupancyCreate: jest.Mock;
  let moveInFindFirst: jest.Mock;
  let moveInFindMany: jest.Mock;
  let moveInUpdate: jest.Mock;
  let moveInUpdateMany: jest.Mock;
  let moveOutFindFirst: jest.Mock;
  let moveOutFindMany: jest.Mock;
  let moveOutUpdateMany: jest.Mock;
  let moveInRequestCount: jest.Mock;
  let moveOutRequestCount: jest.Mock;
  let userAccessAssignmentFindMany: jest.Mock;
  let accessControlGetUserEffectivePermissions: jest.Mock;
  let notificationsCreateForUsers: jest.Mock;
  let leaseActivityCreate: jest.Mock;
  let leaseLifecycleMoveOut: jest.Mock;
  let prismaTransaction: jest.Mock;
  let storageGetUploadSignedUrl: jest.Mock;
  let service: ContractsService;

  beforeEach(() => {
    leaseFindFirst = jest.fn();
    leaseFindMany = jest.fn();
    leaseUpdate = jest.fn();
    occupancyFindFirst = jest.fn();
    occupancyCreate = jest.fn();
    moveInFindFirst = jest.fn();
    moveInFindMany = jest.fn();
    moveInUpdate = jest.fn();
    moveInUpdateMany = jest.fn();
    moveOutFindFirst = jest.fn();
    moveOutFindMany = jest.fn();
    moveOutUpdateMany = jest.fn();
    moveInRequestCount = jest.fn();
    moveOutRequestCount = jest.fn();
    userAccessAssignmentFindMany = jest.fn();
    accessControlGetUserEffectivePermissions = jest
      .fn()
      .mockResolvedValue(new Set());
    notificationsCreateForUsers = jest.fn().mockResolvedValue([]);
    leaseActivityCreate = jest.fn();
    leaseLifecycleMoveOut = jest.fn();
    prismaTransaction = jest.fn(async (callback) =>
      callback({
        lease: { update: leaseUpdate },
        occupancy: {
          findFirst: occupancyFindFirst,
          create: occupancyCreate,
        },
        moveInRequest: { updateMany: moveInUpdateMany },
        moveOutRequest: { updateMany: moveOutUpdateMany },
      }),
    );
    storageGetUploadSignedUrl = jest.fn();

    prisma = {
      lease: {
        findFirst: leaseFindFirst,
        findMany: leaseFindMany,
        update: leaseUpdate,
      },
      occupancy: {
        findFirst: occupancyFindFirst,
        create: occupancyCreate,
      },
      moveOutRequest: {
        findFirst: moveOutFindFirst,
        findMany: moveOutFindMany,
        updateMany: moveOutUpdateMany,
        count: moveOutRequestCount,
      },
      userAccessAssignment: {
        findMany: userAccessAssignmentFindMany,
      },
      moveInRequest: {
        findFirst: moveInFindFirst,
        findMany: moveInFindMany,
        update: moveInUpdate,
        updateMany: moveInUpdateMany,
        count: moveInRequestCount,
      },
      $transaction: prismaTransaction,
    } as unknown as PrismaService;

    service = new ContractsService(
      prisma,
      {} as BuildingsRepo,
      {} as UnitsRepo,
      {} as LeaseHistoryRepo,
      {
        create: leaseActivityCreate,
      } as unknown as LeaseActivityRepo,
      {
        moveOut: leaseLifecycleMoveOut,
      } as unknown as LeaseLifecycleService,
      {} as LeaseDocumentsService,
      {
        getUploadSignedUrl: storageGetUploadSignedUrl,
      } as unknown as StorageService,
      {
        getUserEffectivePermissions: accessControlGetUserEffectivePermissions,
      } as unknown as AccessControlService,
      {
        createForUsers: notificationsCreateForUsers,
      } as unknown as NotificationsService,
    );
  });

  it('returns move-in eligibility for active contract without occupancy', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      occupancyId: null,
      occupancy: null,
    } as never);
    moveInFindFirst.mockResolvedValue(null);
    moveOutFindFirst.mockResolvedValue(null);

    const result = await service.getLatestContractSummaryForResident({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result.contract?.id).toBe('contract-1');
    expect(result.canRequestMoveIn).toBe(true);
    expect(result.canRequestMoveOut).toBe(false);
    expect(result.latestMoveInRequestStatus).toBeNull();
    expect(result.latestMoveOutRequestStatus).toBeNull();
  });

  it('disables move-in when latest move-in request is pending', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      occupancyId: null,
      occupancy: null,
    } as never);
    moveInFindFirst.mockResolvedValue({
      status: MoveRequestStatus.PENDING,
    } as never);
    moveOutFindFirst.mockResolvedValue(null);

    const result = await service.getLatestContractSummaryForResident({
      sub: 'resident-1',
      orgId: 'org-1',
    });

    expect(result.canRequestMoveIn).toBe(false);
    expect(result.latestMoveInRequestStatus).toBe(MoveRequestStatus.PENDING);
  });

  it('blocks new move-in request when an approved one already exists', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      occupancyId: null,
      occupancy: null,
    } as never);
    moveInFindFirst.mockResolvedValue({
      id: 'move-in-1',
      status: MoveRequestStatus.APPROVED,
    } as never);

    await expect(
      service.createResidentMoveInRequest(
        { sub: 'resident-1', orgId: 'org-1' },
        'contract-1',
        { requestedMoveAt: new Date().toISOString() },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates resident contract upload url scoped to contract owner', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      occupancyId: null,
      occupancy: null,
    } as never);
    storageGetUploadSignedUrl.mockResolvedValue(
      'https://upload.example/presigned-put',
    );

    const result = await service.createResidentContractDocumentUploadUrl(
      { sub: 'resident-1', orgId: 'org-1' },
      'contract-1',
      {
        type: LeaseDocumentType.SIGNED_TENANCY_CONTRACT,
        fileName: 'signed-contract.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
    );

    expect(result.uploadUrl).toBe('https://upload.example/presigned-put');
    expect(
      result.storageUrl.startsWith('storage://contracts/org-1/contract-1/'),
    ).toBe(true);
    expect(storageGetUploadSignedUrl).toHaveBeenCalled();
  });

  it('returns contract details to the owning resident', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      occupancyId: null,
      occupancy: null,
    } as never);

    const result = await service.getResidentContractById(
      { sub: 'resident-1', orgId: 'org-1' },
      'contract-1',
    );

    expect(result.id).toBe('contract-1');
  });

  it('blocks resident contract access for a different tenant', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      residentUserId: 'resident-2',
      status: LeaseStatus.ACTIVE,
      occupancyId: null,
      occupancy: null,
    } as never);

    await expect(
      service.getResidentContractById(
        { sub: 'resident-1', orgId: 'org-1' },
        'contract-1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cancels open move requests when cancelling a contract', async () => {
    leaseFindFirst
      .mockResolvedValueOnce({
        id: 'contract-1',
        orgId: 'org-1',
        status: LeaseStatus.ACTIVE,
      } as never)
      .mockResolvedValueOnce({
        id: 'contract-1',
        orgId: 'org-1',
        status: LeaseStatus.CANCELLED,
      } as never);

    const result = await service.cancelContract(
      { sub: 'manager-1', orgId: 'org-1' },
      'contract-1',
      'Resident withdrew',
    );

    expect(prismaTransaction).toHaveBeenCalled();
    expect(moveInUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        leaseId: 'contract-1',
        status: {
          in: [MoveRequestStatus.PENDING, MoveRequestStatus.APPROVED],
        },
      },
      data: { status: MoveRequestStatus.CANCELLED },
    });
    expect(moveOutUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        leaseId: 'contract-1',
        status: {
          in: [MoveRequestStatus.PENDING, MoveRequestStatus.APPROVED],
        },
      },
      data: { status: MoveRequestStatus.CANCELLED },
    });
    expect(leaseUpdate).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { status: LeaseStatus.CANCELLED },
    });
    expect(leaseLifecycleMoveOut).not.toHaveBeenCalled();
    expect(leaseActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        leaseId: 'contract-1',
        action: 'CONTRACT_CANCELLED',
        changedByUserId: 'manager-1',
        payload: expect.objectContaining({
          fromStatus: LeaseStatus.ACTIVE,
          toStatus: LeaseStatus.CANCELLED,
          reason: 'Resident withdrew',
        }),
      }),
      expect.any(Object),
    );
    expect(result.status).toBe(LeaseStatus.CANCELLED);
  });

  it('ends active occupancy before cancelling an occupied contract', async () => {
    leaseFindFirst
      .mockResolvedValueOnce({
        id: 'contract-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        status: LeaseStatus.ACTIVE,
        occupancyId: 'occupancy-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'contract-1',
        orgId: 'org-1',
        status: LeaseStatus.CANCELLED,
        occupancyId: 'occupancy-1',
      } as never);

    const result = await service.cancelContract(
      { sub: 'manager-1', orgId: 'org-1' },
      'contract-1',
      'Owner terminated tenancy',
    );

    expect(leaseLifecycleMoveOut).toHaveBeenCalledWith(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
      'contract-1',
      expect.objectContaining({
        actualMoveOutDate: expect.any(String),
      }),
    );
    expect(leaseUpdate).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { status: LeaseStatus.CANCELLED },
    });
    expect(result.status).toBe(LeaseStatus.CANCELLED);
  });

  it('blocks move-in approval without scoped review permission', async () => {
    accessControlGetUserEffectivePermissions.mockResolvedValue(new Set());
    moveInFindFirst.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      leaseId: 'contract-1',
      status: MoveRequestStatus.PENDING,
    } as never);

    await expect(
      service.approveMoveInRequest(
        { sub: 'reviewer-1', orgId: 'org-1' },
        'request-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(accessControlGetUserEffectivePermissions).toHaveBeenCalledWith(
      'reviewer-1',
      {
        orgId: 'org-1',
        buildingId: 'building-1',
      },
    );
    expect(moveInUpdate).not.toHaveBeenCalled();
  });

  it('allows org-level move-in approval without a building assignment', async () => {
    accessControlGetUserEffectivePermissions.mockResolvedValue(
      new Set(['contracts.move_requests.review']),
    );
    moveInFindFirst.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      leaseId: 'contract-1',
      status: MoveRequestStatus.PENDING,
    } as never);
    moveInUpdate.mockResolvedValue({
      id: 'request-1',
      status: MoveRequestStatus.APPROVED,
    } as never);
    prismaTransaction.mockImplementationOnce(async (callback) =>
      callback({
        moveInRequest: {
          findFirst: moveInFindFirst,
          update: moveInUpdate,
        },
        leaseActivity: {
          create: leaseActivityCreate,
        },
      }),
    );

    await expect(
      service.approveMoveInRequest(
        { sub: 'reviewer-1', orgId: 'org-1' },
        'request-1',
      ),
    ).resolves.toMatchObject({ status: MoveRequestStatus.APPROVED });

    expect(moveInUpdate).toHaveBeenCalled();
  });

  it('blocks move-out execution without scoped execution permission', async () => {
    accessControlGetUserEffectivePermissions.mockResolvedValue(new Set());
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      occupancyId: 'occupancy-1',
      leaseEndDate: new Date('2026-12-31T00:00:00.000Z'),
    } as never);

    await expect(
      service.executeApprovedMoveOut(
        { sub: 'reviewer-1', orgId: 'org-1' },
        'contract-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(accessControlGetUserEffectivePermissions).toHaveBeenCalledWith(
      'reviewer-1',
      {
        orgId: 'org-1',
        buildingId: 'building-1',
      },
    );
    expect(leaseLifecycleMoveOut).not.toHaveBeenCalled();
  });

  it('notifies management when a resident creates a move-in request', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      occupancyId: null,
      unit: { label: 'A-101' },
      residentUser: { name: 'Tenant One' },
      occupancy: null,
    } as never);
    userAccessAssignmentFindMany
      .mockResolvedValueOnce([{ userId: 'manager-1' }])
      .mockResolvedValueOnce([{ userId: 'admin-1' }]);
    const createdRequest = {
      id: 'move-in-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      leaseId: 'contract-1',
      residentUserId: 'resident-1',
      status: MoveRequestStatus.PENDING,
      requestedMoveAt: new Date('2026-03-20T10:00:00.000Z'),
    };
    prismaTransaction.mockImplementationOnce(async (callback) =>
      callback({
        moveInRequest: {
          create: jest.fn().mockResolvedValue(createdRequest),
        },
      }),
    );

    const result = await service.createResidentMoveInRequest(
      { sub: 'resident-1', orgId: 'org-1' },
      'contract-1',
      { requestedMoveAt: '2026-03-20T10:00:00.000Z', notes: 'Need access' },
    );

    expect(result.id).toBe('move-in-1');
    expect(notificationsCreateForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        userIds: ['manager-1', 'admin-1'],
        type: NotificationTypeEnum.MOVE_IN_REQUEST_CREATED,
        title: 'New move-in request',
      }),
    );
  });

  it('notifies management when a resident creates a move-out request', async () => {
    leaseFindFirst.mockResolvedValue({
      id: 'contract-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      occupancyId: 'occupancy-1',
      unit: { label: 'A-101' },
      residentUser: { name: 'Tenant One' },
      occupancy: { status: 'ACTIVE' },
    } as never);
    userAccessAssignmentFindMany
      .mockResolvedValueOnce([{ userId: 'manager-1' }])
      .mockResolvedValueOnce([{ userId: 'admin-1' }]);
    const createdRequest = {
      id: 'move-out-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      leaseId: 'contract-1',
      residentUserId: 'resident-1',
      status: MoveRequestStatus.PENDING,
      requestedMoveAt: new Date('2026-03-25T10:00:00.000Z'),
    };
    prismaTransaction.mockImplementationOnce(async (callback) =>
      callback({
        moveOutRequest: {
          create: jest.fn().mockResolvedValue(createdRequest),
        },
      }),
    );

    const result = await service.createResidentMoveOutRequest(
      { sub: 'resident-1', orgId: 'org-1' },
      'contract-1',
      { requestedMoveAt: '2026-03-25T10:00:00.000Z', notes: 'Leaving town' },
    );

    expect(result.id).toBe('move-out-1');
    expect(notificationsCreateForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        userIds: ['manager-1', 'admin-1'],
        type: NotificationTypeEnum.MOVE_OUT_REQUEST_CREATED,
        title: 'New move-out request',
      }),
    );
  });

  it('returns pending move-request inbox counts for assigned reviewers', async () => {
    accessControlGetUserEffectivePermissions.mockResolvedValue(new Set());
    userAccessAssignmentFindMany.mockResolvedValue([{ scopeId: 'building-1' }]);
    moveInRequestCount.mockResolvedValue(3);
    moveOutRequestCount.mockResolvedValue(2);

    const result = await service.getMoveRequestInboxCount({
      sub: 'reviewer-1',
      orgId: 'org-1',
    });

    expect(moveInRequestCount).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        status: MoveRequestStatus.PENDING,
        buildingId: { in: ['building-1'] },
      },
    });
    expect(moveOutRequestCount).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        status: MoveRequestStatus.PENDING,
        buildingId: { in: ['building-1'] },
      },
    });
    expect(result).toEqual({
      moveInCount: 3,
      moveOutCount: 2,
      totalCount: 5,
    });
  });

  it('starts occupancy at execution time when executing move in', async () => {
    const executedAt = new Date('2026-03-20T12:34:56.000Z');
    jest.useFakeTimers().setSystemTime(executedAt);

    leaseFindFirst
      .mockResolvedValueOnce({
        id: 'contract-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        residentUserId: 'resident-1',
        status: LeaseStatus.ACTIVE,
        occupancyId: null,
      } as never)
      .mockResolvedValueOnce({
        id: 'contract-1',
        orgId: 'org-1',
        status: LeaseStatus.ACTIVE,
        occupancyId: 'occupancy-1',
      } as never);
    moveInFindFirst.mockResolvedValue({
      id: 'request-1',
      requestedMoveAt: new Date('2026-03-20T09:10:00.000Z'),
    } as never);
    accessControlGetUserEffectivePermissions.mockResolvedValue(
      new Set(['contracts.move_in.execute']),
    );
    occupancyFindFirst.mockResolvedValue(null);
    occupancyCreate.mockResolvedValue({ id: 'occupancy-1' } as never);

    prismaTransaction.mockImplementationOnce(async (callback) =>
      callback({
        lease: {
          findFirst: leaseFindFirst,
          update: leaseUpdate,
        },
        occupancy: {
          findFirst: occupancyFindFirst,
          create: occupancyCreate,
        },
        moveInRequest: {
          findFirst: moveInFindFirst,
          update: moveInUpdate,
        },
      }),
    );

    const result = await service.executeApprovedMoveIn(
      { sub: 'manager-1', orgId: 'org-1' },
      'contract-1',
    );

    expect(occupancyCreate).toHaveBeenCalledWith({
      data: {
        buildingId: 'building-1',
        unitId: 'unit-1',
        residentUserId: 'resident-1',
        status: 'ACTIVE',
        startAt: executedAt,
        endAt: null,
      },
    });
    expect(moveInUpdate).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { status: MoveRequestStatus.COMPLETED },
    });
    expect(leaseActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MOVE_IN',
        payload: expect.objectContaining({
          requestId: 'request-1',
          occupancyId: 'occupancy-1',
          requestedMoveAt: '2026-03-20T09:10:00.000Z',
          actualMoveInAt: '2026-03-20T12:34:56.000Z',
        }),
      }),
      expect.any(Object),
    );
    expect(result.occupancyId).toBe('occupancy-1');

    jest.useRealTimers();
  });
});

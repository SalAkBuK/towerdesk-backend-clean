import { EventEmitter2 } from '@nestjs/event-emitter';
import { MaintenanceRequestsService } from './maintenance-requests.service';
import { MaintenanceRequestsRepo } from './maintenance-requests.repo';
import { MAINTENANCE_REQUEST_EVENTS } from './maintenance-requests.events';
import { MaintenanceRequestEmergencySignalEnum } from './maintenance-requests.constants';
import { BuildingAccessService } from '../../common/building-access/building-access.service';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ProviderAccessService } from '../service-providers/provider-access.service';
import { CreateResidentRequestDto } from './dto/create-resident-request.dto';

describe('MaintenanceRequestsService', () => {
  let requestsRepo: jest.Mocked<MaintenanceRequestsRepo>;
  let buildingAccessService: jest.Mocked<BuildingAccessService>;
  let accessControlService: jest.Mocked<AccessControlService>;
  let providerAccessService: jest.Mocked<ProviderAccessService>;
  let prisma: {
    $transaction: jest.Mock;
    occupancy: { findMany: jest.Mock };
    lease: { findMany: jest.Mock };
    residentProfile: { findMany: jest.Mock };
    residentInvite: { findMany: jest.Mock };
  };
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let service: MaintenanceRequestsService;

  beforeEach(() => {
    requestsRepo = {
      createRequestWithAttachments: jest.fn(),
      findById: jest.fn(),
      findByIdForCreator: jest.fn(),
      listByBuilding: jest.fn(),
      listByCreator: jest.fn(),
      findByIdForBuilding: jest.fn(),
      findAssignedActiveOccupancy: jest.fn(),
      findUserById: jest.fn(),
      findBuildingScopedAssignmentsForUser: jest.fn(),
      findServiceProviderById: jest.fn(),
      findServiceProviderBuildingLink: jest.fn(),
      findServiceProviderUserMembership: jest.fn(),
      updateById: jest.fn(),
      listByServiceProviders: jest.fn(),
      listPendingEstimateReminderRequests: jest.fn(),
      markEstimateReminderSentIfPending: jest.fn(),
      listCommentReadStates: jest.fn(),
      listCommentTimestamps: jest.fn(),
      upsertCommentReadState: jest.fn(),
      listComments: jest.fn(),
      createComment: jest.fn(),
    } as unknown as jest.Mocked<MaintenanceRequestsRepo>;

    buildingAccessService = {
      assertBuildingInOrg: jest.fn(),
    } as unknown as jest.Mocked<BuildingAccessService>;

    accessControlService = {
      getUserScopedAssignments: jest.fn(),
      getUserEffectivePermissions: jest.fn(),
    } as unknown as jest.Mocked<AccessControlService>;

    providerAccessService = {
      getAccessibleProviderContext: jest.fn(),
    } as unknown as jest.Mocked<ProviderAccessService>;

    prisma = {
      $transaction: jest.fn(async (callback: (tx: object) => unknown) =>
        callback({}),
      ),
      occupancy: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      lease: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      residentProfile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      residentInvite: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new MaintenanceRequestsService(
      prisma as unknown as PrismaService,
      requestsRepo,
      buildingAccessService,
      accessControlService,
      providerAccessService,
      eventEmitter,
    );

    requestsRepo.findAssignedActiveOccupancy.mockResolvedValue({
      buildingId: 'building-1',
      unitId: 'unit-1',
      building: { orgId: 'org-1' },
      lease: null,
    } as never);
  });

  it('treats custom building-scoped handlers without requests.assign as staff-only', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_ops' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.read', 'requests.comment', 'requests.update_status']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([]);

    await service.listBuildingRequests(
      { sub: 'user-1', orgId: 'org-1' },
      'building-1',
    );

    expect(requestsRepo.listByBuilding).toHaveBeenCalledWith(
      'org-1',
      'building-1',
      undefined,
      'user-1',
    );
  });

  it('persists resident emergency intake when creating a request', async () => {
    requestsRepo.findAssignedActiveOccupancy.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      building: { orgId: 'org-1' },
      lease: { id: 'lease-1', status: 'ACTIVE' },
    } as never);
    requestsRepo.createRequestWithAttachments.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      occupancyIdAtCreation: 'occupancy-1',
      leaseIdAtCreation: 'lease-1',
      title: 'Water leak',
      status: 'OPEN',
      isEmergency: true,
      emergencySignals: ['ACTIVE_LEAK', 'NO_POWER'],
      createdByUserId: 'resident-1',
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
    } as never);

    await service.createResidentRequest({ sub: 'resident-1', orgId: 'org-1' }, {
      title: 'Water leak',
      description: 'Emergency signal: active leakage.',
      emergencySignals: ['ACTIVE_LEAK', 'NO_POWER', 'ACTIVE_LEAK'],
    } as unknown as CreateResidentRequestDto);

    expect(requestsRepo.createRequestWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Water leak',
        isEmergency: true,
        emergencySignals: ['ACTIVE_LEAK', 'NO_POWER'],
        occupancyAtCreation: {
          connect: {
            id: 'occupancy-1',
          },
        },
        leaseAtCreation: {
          connect: {
            id: 'lease-1',
          },
        },
      }),
      [],
      expect.any(Object),
    );
  });

  it('returns current tenancy context for a newly created resident request', async () => {
    requestsRepo.findAssignedActiveOccupancy.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      building: { orgId: 'org-1' },
      lease: { id: 'lease-1', status: 'ACTIVE' },
    } as never);
    requestsRepo.createRequestWithAttachments.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      occupancyIdAtCreation: 'occupancy-1',
      leaseIdAtCreation: 'lease-1',
      title: 'Water leak',
      status: 'OPEN',
      createdByUserId: 'resident-1',
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
    } as never);
    prisma.occupancy.findMany.mockImplementation(async ({ select }) => {
      if (select?.residentUser?.select?.name) {
        return [
          {
            unitId: 'unit-1',
            residentUserId: 'resident-1',
            residentUser: { name: 'Resident One' },
          },
        ] as never;
      }

      if (select?.startAt) {
        return [
          {
            id: 'occupancy-1',
            residentUserId: 'resident-1',
            buildingId: 'building-1',
            unitId: 'unit-1',
            status: 'ACTIVE',
            startAt: new Date('2026-04-01T00:00:00.000Z'),
            endAt: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            building: { orgId: 'org-1' },
          },
        ] as never;
      }

      return [
        {
          residentUserId: 'resident-1',
          status: 'ACTIVE',
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          id: 'occupancy-1',
          building: { orgId: 'org-1' },
        },
      ] as never;
    });
    prisma.lease.findMany.mockResolvedValue([
      {
        id: 'lease-1',
        orgId: 'org-1',
        residentUserId: 'resident-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        occupancyId: 'occupancy-1',
        status: 'ACTIVE',
        leaseStartDate: new Date('2026-04-01T00:00:00.000Z'),
        leaseEndDate: new Date('2027-03-31T23:59:59.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-12T00:00:00.000Z'),
      },
    ] as never);

    const request = await service.createResidentRequest(
      { sub: 'resident-1', orgId: 'org-1' },
      { title: 'Water leak' } as unknown as CreateResidentRequestDto,
    );

    expect(request.requestTenancyContext).toEqual({
      occupancyIdAtCreation: 'occupancy-1',
      leaseIdAtCreation: 'lease-1',
      currentOccupancyId: 'occupancy-1',
      currentLeaseId: 'lease-1',
      isCurrentOccupancy: true,
      isCurrentLease: true,
      label: 'CURRENT_OCCUPANCY',
      leaseLabel: 'CURRENT_LEASE',
      tenancyContextSource: 'SNAPSHOT',
      leaseContextSource: 'SNAPSHOT',
    });
  });

  it('allows residents to update request triage fields while open', async () => {
    requestsRepo.findByIdForCreator.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      createdByUserId: 'resident-1',
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
      title: 'AC issue',
      description: 'Bedroom unit not cooling',
      type: 'OTHER',
      priority: 'LOW',
      status: 'OPEN',
      isEmergency: false,
      emergencySignals: [],
    } as never);
    requestsRepo.updateById.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      createdByUserId: 'resident-1',
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
      title: 'AC not cooling',
      description: 'Bedroom unit still not cooling',
      type: 'PLUMBING_AC_HEATING',
      priority: 'HIGH',
      status: 'OPEN',
      isEmergency: true,
      emergencySignals: ['NO_COOLING'],
    } as never);

    await service.updateResidentRequest(
      { sub: 'resident-1', orgId: 'org-1' },
      'request-1',
      {
        title: 'AC not cooling',
        description: 'Bedroom unit still not cooling',
        type: 'PLUMBING_AC_HEATING',
        priority: 'HIGH',
        emergencySignals: [MaintenanceRequestEmergencySignalEnum.NO_COOLING],
      },
    );

    expect(requestsRepo.updateById).toHaveBeenCalledWith('request-1', {
      title: 'AC not cooling',
      description: 'Bedroom unit still not cooling',
      type: 'PLUMBING_AC_HEATING',
      priority: 'HIGH',
      isEmergency: true,
      emergencySignals: ['NO_COOLING'],
    });
  });

  it('restores prior resident request history once the same user is active again', async () => {
    requestsRepo.listByCreator.mockResolvedValue([
      {
        id: 'request-legacy',
        orgId: 'org-1',
        buildingId: 'building-legacy',
        unitId: 'unit-legacy',
        createdByUserId: 'resident-1',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        title: 'Old request',
        status: 'OPEN',
      },
    ] as never);

    await expect(
      service.listResidentRequests({ sub: 'resident-1', orgId: 'org-1' }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'request-legacy',
        unitId: 'unit-legacy',
      }),
    ]);

    expect(requestsRepo.listByCreator).toHaveBeenCalledWith(
      'org-1',
      'resident-1',
    );
  });

  it('scopes resident occupancy lookup to the current org when loading history', async () => {
    requestsRepo.listByCreator.mockResolvedValue([]);

    await service.listResidentRequests({ sub: 'resident-1', orgId: 'org-1' });

    expect(requestsRepo.findAssignedActiveOccupancy).toHaveBeenCalledWith(
      'resident-1',
      'org-1',
      undefined,
    );
  });

  it.each([
    [
      'list resident requests',
      () => service.listResidentRequests({ sub: 'resident-1', orgId: 'org-1' }),
    ],
    [
      'get resident request',
      () =>
        service.getResidentRequest(
          { sub: 'resident-1', orgId: 'org-1' },
          'request-1',
        ),
    ],
    [
      'update resident request',
      () =>
        service.updateResidentRequest(
          { sub: 'resident-1', orgId: 'org-1' },
          'request-1',
          { title: 'Updated title' },
        ),
    ],
    [
      'cancel resident request',
      () =>
        service.cancelResidentRequest(
          { sub: 'resident-1', orgId: 'org-1' },
          'request-1',
        ),
    ],
    [
      'list resident comments',
      () =>
        service.listResidentComments(
          { sub: 'resident-1', orgId: 'org-1' },
          'request-1',
        ),
    ],
    [
      'add resident comment',
      () =>
        service.addResidentComment(
          { sub: 'resident-1', orgId: 'org-1' },
          'request-1',
          { message: 'Any update?' },
        ),
    ],
  ])(
    'requires active occupancy to %s',
    async (_label, action: () => Promise<unknown>) => {
      requestsRepo.findAssignedActiveOccupancy.mockResolvedValue(null as never);

      await expect(action()).rejects.toThrow('Active occupancy required');
    },
  );

  it('allows assigning work to a custom building-scoped request handler', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.assign']),
    );
    requestsRepo.findByIdForBuilding.mockResolvedValue({
      id: 'request-1',
      status: 'OPEN',
    } as never);
    requestsRepo.findUserById.mockResolvedValue({
      id: 'staff-1',
      orgId: 'org-1',
      isActive: true,
    } as never);
    requestsRepo.findBuildingScopedAssignmentsForUser.mockResolvedValue([
      {
        roleTemplate: {
          rolePermissions: [
            { permission: { key: 'requests.read' } },
            { permission: { key: 'requests.comment' } },
            { permission: { key: 'requests.update_status' } },
          ],
        },
      },
    ] as never);
    requestsRepo.updateById.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      title: 'Leaking pipe',
      status: 'ASSIGNED',
      createdByUserId: 'resident-1',
      assignedToUserId: 'staff-1',
    } as never);

    const updated = await service.assignRequest(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
      'request-1',
      { staffUserId: 'staff-1' },
    );

    expect(
      requestsRepo.findBuildingScopedAssignmentsForUser,
    ).toHaveBeenCalledWith('building-1', 'staff-1', 'org-1', {});
    expect(requestsRepo.updateById).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        assignedToUser: { connect: { id: 'staff-1' } },
        status: 'ASSIGNED',
      }),
      {},
    );
    expect(updated.assignedToUserId).toBe('staff-1');
  });

  it('allows assigning a request to a linked active service provider', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.assign']),
    );
    requestsRepo.findByIdForBuilding.mockResolvedValue({
      id: 'request-1',
      status: 'OPEN',
    } as never);
    requestsRepo.findServiceProviderById.mockResolvedValue({
      id: 'provider-1',
      isActive: true,
    } as never);
    requestsRepo.findServiceProviderBuildingLink.mockResolvedValue({
      serviceProviderId: 'provider-1',
      buildingId: 'building-1',
    } as never);
    requestsRepo.updateById.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      title: 'Leaking pipe',
      status: 'ASSIGNED',
      createdByUserId: 'resident-1',
      assignedToUserId: null,
      serviceProviderId: 'provider-1',
    } as never);

    const updated = await service.assignProvider(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
      'request-1',
      { serviceProviderId: 'provider-1' },
    );

    expect(requestsRepo.findServiceProviderById).toHaveBeenCalledWith(
      'provider-1',
      {},
    );
    expect(requestsRepo.findServiceProviderBuildingLink).toHaveBeenCalledWith(
      'provider-1',
      'building-1',
      {},
    );
    expect(requestsRepo.updateById).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        assignedToUser: { disconnect: true },
        serviceProvider: { connect: { id: 'provider-1' } },
        serviceProviderAssignedUser: { disconnect: true },
        status: 'ASSIGNED',
      }),
      {},
    );
    expect(updated.serviceProviderId).toBe('provider-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MAINTENANCE_REQUEST_EVENTS.ASSIGNED,
      expect.objectContaining({
        actorUserId: 'manager-1',
        request: expect.objectContaining({
          id: 'request-1',
          serviceProviderId: 'provider-1',
          serviceProviderAssignedUserId: null,
        }),
      }),
    );
  });

  it('emits assignment updates when requesting an estimate from a provider', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.assign']),
    );
    requestsRepo.findByIdForBuilding.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      title: 'Water heater issue',
      description: 'Needs estimate',
      type: 'PLUMBING_AC_HEATING',
      priority: 'HIGH',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
      estimateStatus: 'NOT_REQUESTED',
      estimatedAmount: null,
      estimatedCurrency: null,
      isEmergency: false,
      isLikeForLike: null,
      isUpgrade: null,
      isMajorReplacement: null,
      isResponsibilityDisputed: null,
    } as never);
    requestsRepo.findServiceProviderById.mockResolvedValue({
      id: 'provider-1',
      isActive: true,
    } as never);
    requestsRepo.findServiceProviderBuildingLink.mockResolvedValue({
      serviceProviderId: 'provider-1',
      buildingId: 'building-1',
    } as never);
    requestsRepo.updateById.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      title: 'Water heater issue',
      status: 'OPEN',
      estimateStatus: 'REQUESTED',
      createdByUserId: 'resident-1',
      serviceProviderId: 'provider-1',
    } as never);

    await service.requestEstimateFromProvider(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
      'request-1',
      { serviceProviderId: 'provider-1' },
    );

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MAINTENANCE_REQUEST_EVENTS.ASSIGNED,
      expect.objectContaining({
        actorUserId: 'manager-1',
        request: expect.objectContaining({
          id: 'request-1',
          serviceProviderId: 'provider-1',
        }),
      }),
    );
  });

  it('allows assigning a worker from the request service provider membership', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.assign']),
    );
    requestsRepo.findByIdForBuilding.mockResolvedValue({
      id: 'request-1',
      status: 'ASSIGNED',
      serviceProviderId: 'provider-1',
      serviceProvider: {
        id: 'provider-1',
        isActive: true,
      },
      assignedAt: new Date('2026-04-06T00:00:00.000Z'),
    } as never);
    requestsRepo.findServiceProviderUserMembership.mockResolvedValue({
      serviceProviderId: 'provider-1',
      userId: 'worker-1',
      isActive: true,
      user: {
        id: 'worker-1',
        isActive: true,
      },
    } as never);
    requestsRepo.updateById.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      title: 'Leaking pipe',
      status: 'ASSIGNED',
      createdByUserId: 'resident-1',
      assignedToUserId: null,
      serviceProviderId: 'provider-1',
      serviceProviderAssignedUserId: 'worker-1',
    } as never);

    const updated = await service.assignProviderWorker(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
      'request-1',
      { userId: 'worker-1' },
    );

    expect(requestsRepo.findServiceProviderUserMembership).toHaveBeenCalledWith(
      'provider-1',
      'worker-1',
      {},
    );
    expect(requestsRepo.updateById).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        assignedToUser: { disconnect: true },
        serviceProviderAssignedUser: { connect: { id: 'worker-1' } },
        status: 'ASSIGNED',
      }),
      {},
    );
    expect(updated.serviceProviderAssignedUserId).toBe('worker-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MAINTENANCE_REQUEST_EVENTS.ASSIGNED,
      expect.objectContaining({
        actorUserId: 'manager-1',
        request: expect.objectContaining({
          id: 'request-1',
          serviceProviderId: 'provider-1',
          serviceProviderAssignedUserId: 'worker-1',
        }),
      }),
    );
  });

  it('emits a status update when a provider assignment is removed', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.assign']),
    );
    requestsRepo.findByIdForBuilding.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      title: 'Leaking pipe',
      status: 'ASSIGNED',
      estimateStatus: 'NOT_REQUESTED',
      ownerApprovalStatus: 'NOT_REQUIRED',
      createdByUserId: 'resident-1',
      serviceProviderId: 'provider-1',
      assignedToUserId: null,
      serviceProviderAssignedUserId: 'worker-1',
    } as never);
    requestsRepo.updateById.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      title: 'Leaking pipe',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
      createdByUserId: 'resident-1',
      serviceProviderId: null,
      assignedToUserId: null,
      serviceProviderAssignedUserId: null,
    } as never);

    await service.unassignProvider(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
      'request-1',
    );

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MAINTENANCE_REQUEST_EVENTS.STATUS_CHANGED,
      expect.objectContaining({
        actorUserId: 'manager-1',
        request: expect.objectContaining({
          id: 'request-1',
          status: 'OPEN',
          serviceProviderId: null,
        }),
      }),
    );
  });

  it('counts unread building comments across visible requests for the current user', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.assign', 'requests.comment']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([
      { id: 'request-1' },
      { id: 'request-2' },
    ] as never);
    requestsRepo.listCommentReadStates.mockResolvedValue([
      {
        requestId: 'request-1',
        lastReadAt: new Date('2026-04-06T00:00:00.000Z'),
      },
    ] as never);
    requestsRepo.listCommentTimestamps.mockResolvedValue([
      {
        requestId: 'request-1',
        createdAt: new Date('2026-04-06T01:00:00.000Z'),
      },
      {
        requestId: 'request-2',
        createdAt: new Date('2026-04-06T01:00:00.000Z'),
      },
    ] as never);

    await expect(
      service.countUnreadBuildingComments(
        { sub: 'user-1', orgId: 'org-1' },
        'building-1',
      ),
    ).resolves.toBe(2);

    expect(requestsRepo.listCommentReadStates).toHaveBeenCalledWith(
      'user-1',
      ['request-1', 'request-2'],
      'BUILDING',
    );
  });

  it('counts unread provider comments using shared visibility only', async () => {
    providerAccessService.getAccessibleProviderContext.mockResolvedValue({
      providerIds: new Set(['provider-1']),
      adminProviderIds: new Set(['provider-1']),
      memberships: [],
    } as never);
    requestsRepo.listByServiceProviders.mockResolvedValue([
      { id: 'request-1' },
    ] as never);
    requestsRepo.listCommentReadStates.mockResolvedValue([] as never);
    requestsRepo.listCommentTimestamps.mockResolvedValue([
      {
        requestId: 'request-1',
        createdAt: new Date('2026-04-06T01:00:00.000Z'),
      },
    ] as never);

    await expect(
      service.countUnreadProviderComments({ sub: 'user-1', orgId: 'org-1' }),
    ).resolves.toBe(1);

    expect(requestsRepo.listCommentTimestamps).toHaveBeenCalledWith(
      undefined,
      ['request-1'],
      'user-1',
      'SHARED',
    );
  });

  it('filters building requests by queue state', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.read', 'requests.assign']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([
      {
        id: 'request-pending',
        status: 'OPEN',
        ownerApprovalStatus: 'PENDING',
        createdAt: new Date(),
      },
      {
        id: 'request-approved',
        status: 'OPEN',
        ownerApprovalStatus: 'APPROVED',
        createdAt: new Date(),
      },
    ] as never);

    const requests = await service.listBuildingRequests(
      { sub: 'user-1', orgId: 'org-1' },
      'building-1',
      { queue: 'AWAITING_OWNER' } as never,
    );

    expect(requests.map((request) => request.id)).toEqual(['request-pending']);
  });

  it('filters building requests into the needs-estimate queue', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.read', 'requests.assign']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([
      {
        id: 'request-direct',
        title: 'Light bulb out',
        type: 'ELECTRICAL',
        priority: 'LOW',
        status: 'OPEN',
        ownerApprovalStatus: 'NOT_REQUIRED',
        createdAt: new Date(),
      },
      {
        id: 'request-estimate',
        title: 'Water heater issue',
        description: 'No hot water in the bathroom',
        type: 'PLUMBING_AC_HEATING',
        priority: 'HIGH',
        status: 'OPEN',
        ownerApprovalStatus: 'NOT_REQUIRED',
        createdAt: new Date(),
      },
    ] as never);

    const requests = await service.listBuildingRequests(
      { sub: 'user-1', orgId: 'org-1' },
      'building-1',
      { queue: 'NEEDS_ESTIMATE' } as never,
    );

    expect(requests.map((request) => request.id)).toEqual(['request-estimate']);
  });

  it('filters building requests into the awaiting-estimate queue', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.read', 'requests.assign']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([
      {
        id: 'request-needs-estimate',
        title: 'Water heater issue',
        description: 'No hot water in the bathroom',
        type: 'PLUMBING_AC_HEATING',
        priority: 'HIGH',
        status: 'OPEN',
        ownerApprovalStatus: 'NOT_REQUIRED',
        estimateStatus: 'NOT_REQUESTED',
        createdAt: new Date(),
      },
      {
        id: 'request-awaiting-estimate',
        title: 'AC not cooling',
        description: 'Estimate requested from provider',
        type: 'PLUMBING_AC_HEATING',
        priority: 'HIGH',
        status: 'OPEN',
        ownerApprovalStatus: 'NOT_REQUIRED',
        estimateStatus: 'REQUESTED',
        createdAt: new Date(),
      },
    ] as never);

    const requests = await service.listBuildingRequests(
      { sub: 'user-1', orgId: 'org-1' },
      'building-1',
      { queue: 'AWAITING_ESTIMATE' } as never,
    );

    expect(requests.map((request) => request.id)).toEqual([
      'request-awaiting-estimate',
    ]);
  });

  it('enriches building requests with requester lifecycle context', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.read', 'requests.assign']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([
      {
        id: 'request-1',
        orgId: 'org-1',
        unitId: 'unit-1',
        createdByUserId: 'resident-1',
        ownerApprovalStatus: 'NOT_REQUIRED',
        createdAt: new Date('2026-04-08T00:00:00.000Z'),
      },
    ] as never);
    prisma.occupancy.findMany
      .mockResolvedValueOnce([
        {
          id: 'occupancy-ended',
          residentUserId: 'resident-1',
          status: 'ENDED',
          building: { orgId: 'org-1' },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          unitId: 'unit-1',
          residentUserId: 'resident-2',
          residentUser: { name: 'Current Resident' },
        },
      ] as never)
      .mockResolvedValue([]);
    prisma.lease.findMany.mockResolvedValue([] as never);

    const [request] = await service.listBuildingRequests(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
    );

    expect(request.requesterContext).toEqual({
      isResident: true,
      residentOccupancyStatus: 'FORMER',
      residentInviteStatus: null,
      isFormerResident: true,
      currentUnitOccupiedByRequester: false,
      currentUnitOccupant: {
        userId: 'resident-2',
        name: 'Current Resident',
      },
    });
    expect(request.requestTenancyContext).toEqual({
      occupancyIdAtCreation: null,
      leaseIdAtCreation: null,
      currentOccupancyId: null,
      currentLeaseId: null,
      isCurrentOccupancy: null,
      isCurrentLease: null,
      label: 'UNKNOWN_TENANCY_CYCLE',
      leaseLabel: 'UNKNOWN_LEASE_CYCLE',
      tenancyContextSource: 'UNRESOLVED',
      leaseContextSource: 'UNRESOLVED',
    });
  });

  it('marks requests from a prior occupancy and lease cycle for management views', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.read', 'requests.assign']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([
      {
        id: 'request-legacy',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        createdByUserId: 'resident-1',
        occupancyIdAtCreation: 'occupancy-legacy',
        leaseIdAtCreation: 'lease-legacy',
        ownerApprovalStatus: 'NOT_REQUIRED',
        createdAt: new Date('2026-04-08T00:00:00.000Z'),
      },
    ] as never);
    prisma.occupancy.findMany
      .mockResolvedValueOnce([
        {
          id: 'occupancy-current',
          residentUserId: 'resident-1',
          status: 'ACTIVE',
          building: { orgId: 'org-1' },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          unitId: 'unit-1',
          residentUserId: 'resident-1',
          residentUser: { name: 'Resident One' },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'occupancy-current',
          residentUserId: 'resident-1',
          buildingId: 'building-1',
          unitId: 'unit-1',
          status: 'ACTIVE',
          startAt: new Date('2026-04-10T00:00:00.000Z'),
          endAt: null,
          createdAt: new Date('2026-04-10T00:00:00.000Z'),
          building: { orgId: 'org-1' },
        },
      ] as never);
    prisma.lease.findMany.mockResolvedValue([
      {
        id: 'lease-current',
        orgId: 'org-1',
        residentUserId: 'resident-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        occupancyId: 'occupancy-current',
        status: 'ACTIVE',
        leaseStartDate: new Date('2026-04-10T00:00:00.000Z'),
        leaseEndDate: new Date('2027-04-09T23:59:59.000Z'),
        createdAt: new Date('2026-04-10T00:00:00.000Z'),
        updatedAt: new Date('2026-04-10T00:00:00.000Z'),
      },
    ] as never);

    const [request] = await service.listBuildingRequests(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
    );

    expect(request.requestTenancyContext).toEqual({
      occupancyIdAtCreation: 'occupancy-legacy',
      leaseIdAtCreation: 'lease-legacy',
      currentOccupancyId: 'occupancy-current',
      currentLeaseId: 'lease-current',
      isCurrentOccupancy: false,
      isCurrentLease: false,
      label: 'PREVIOUS_OCCUPANCY',
      leaseLabel: 'PREVIOUS_LEASE',
      tenancyContextSource: 'SNAPSHOT',
      leaseContextSource: 'SNAPSHOT',
    });
  });

  it('infers the current occupancy and lease cycle for management views when legacy rows are missing creation snapshots', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.read', 'requests.assign']),
    );
    requestsRepo.listByBuilding.mockResolvedValue([
      {
        id: 'request-current',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        createdByUserId: 'resident-1',
        occupancyIdAtCreation: null,
        leaseIdAtCreation: null,
        ownerApprovalStatus: 'NOT_REQUIRED',
        createdAt: new Date('2026-04-12T00:00:00.000Z'),
      },
    ] as never);
    prisma.occupancy.findMany
      .mockResolvedValueOnce([
        {
          unitId: 'unit-1',
          residentUserId: 'resident-1',
          status: 'ACTIVE',
          building: { orgId: 'org-1' },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          unitId: 'unit-1',
          residentUserId: 'resident-1',
          residentUser: { name: 'Resident One' },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'occupancy-current',
          residentUserId: 'resident-1',
          buildingId: 'building-1',
          unitId: 'unit-1',
          status: 'ACTIVE',
          startAt: new Date('2026-04-01T00:00:00.000Z'),
          endAt: null,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          building: { orgId: 'org-1' },
        },
        {
          id: 'occupancy-previous',
          residentUserId: 'resident-1',
          buildingId: 'building-1',
          unitId: 'unit-1',
          status: 'ENDED',
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          endAt: new Date('2026-03-31T23:59:59.000Z'),
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          building: { orgId: 'org-1' },
        },
      ] as never);
    prisma.lease.findMany.mockResolvedValue([
      {
        id: 'lease-current',
        orgId: 'org-1',
        residentUserId: 'resident-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        occupancyId: 'occupancy-current',
        status: 'ACTIVE',
        leaseStartDate: new Date('2026-04-01T00:00:00.000Z'),
        leaseEndDate: new Date('2027-03-31T23:59:59.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-12T00:00:00.000Z'),
      },
    ] as never);

    const [request] = await service.listBuildingRequests(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
    );

    expect(request.requestTenancyContext).toEqual({
      occupancyIdAtCreation: 'occupancy-current',
      leaseIdAtCreation: 'lease-current',
      currentOccupancyId: 'occupancy-current',
      currentLeaseId: 'lease-current',
      isCurrentOccupancy: true,
      isCurrentLease: true,
      label: 'CURRENT_OCCUPANCY',
      leaseLabel: 'CURRENT_LEASE',
      tenancyContextSource: 'HISTORICAL_INFERENCE',
      leaseContextSource: 'HISTORICAL_INFERENCE',
    });
  });

  it('requests owner approval atomically in one transaction', async () => {
    const auditCreate = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (callback: (tx: object) => unknown) =>
        callback({
          maintenanceRequestOwnerApprovalAudit: {
            create: auditCreate,
          },
        }),
    );
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'BUILDING',
          roleTemplate: { key: 'custom_manager' },
        },
      ],
      rolePermissionKeys: [],
      userOverrides: [],
    } as never);
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['requests.assign']),
    );
    requestsRepo.findByIdForBuilding.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      title: 'Leaking pipe',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
      estimatedAmount: null,
      estimatedCurrency: null,
      isEmergency: false,
      isLikeForLike: null,
      isUpgrade: null,
      isMajorReplacement: null,
      isResponsibilityDisputed: null,
    } as never);
    requestsRepo.updateById.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      title: 'Leaking pipe',
      status: 'OPEN',
      createdByUserId: 'resident-1',
      ownerApprovalStatus: 'PENDING',
      ownerApprovalRequestedAt: new Date('2026-04-08T10:00:00.000Z'),
      ownerApprovalRequestedByUserId: 'manager-1',
      isEmergency: false,
      unit: { id: 'unit-1', label: 'A-101' },
    } as never);

    const updated = await service.requestOwnerApprovalNow(
      { sub: 'manager-1', orgId: 'org-1' },
      'building-1',
      'request-1',
      {
        approvalRequiredReason: 'Estimate exceeds threshold',
        estimatedAmount: 1250,
        estimatedCurrency: 'aed',
        isLikeForLike: false,
      },
    );

    expect(requestsRepo.updateById).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        ownerApprovalStatus: 'PENDING',
        approvalRequiredReason: 'Estimate exceeds threshold',
        ownerApprovalRequestedByUser: { connect: { id: 'manager-1' } },
        isLikeForLike: false,
      }),
      expect.any(Object),
    );
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REQUESTED,
      expect.objectContaining({
        actorUserId: 'manager-1',
        request: expect.objectContaining({
          id: 'request-1',
          ownerApprovalStatus: 'PENDING',
        }),
      }),
    );
    expect(updated.ownerApprovalStatus).toBe('PENDING');
  });
});

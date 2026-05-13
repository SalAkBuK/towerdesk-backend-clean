import {
  MaintenanceRequestOwnerApprovalDecisionSource,
  MaintenanceRequestOwnerApprovalStatus,
  OwnerAccessGrantStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MaintenanceRequestOwnerApprovalStatusEnum } from '../maintenance-requests/maintenance-requests.constants';
import { OwnerPortfolioScopeService } from './owner-portfolio-scope.service';

describe('OwnerPortfolioScopeService', () => {
  let prisma: {
    ownerAccessGrant: { findFirst: jest.Mock; findMany: jest.Mock };
    unitOwnership: { findMany: jest.Mock };
    unit: { findMany: jest.Mock };
    occupancy: { findFirst: jest.Mock; findMany: jest.Mock };
    lease: { findMany: jest.Mock };
    residentProfile: { findMany: jest.Mock };
    residentInvite: { findMany: jest.Mock };
    maintenanceRequest: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    maintenanceRequestComment: { findMany: jest.Mock; create: jest.Mock };
    ownerRequestCommentReadState: { findMany: jest.Mock; upsert: jest.Mock };
    maintenanceRequestOwnerApprovalAudit: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let service: OwnerPortfolioScopeService;

  beforeEach(() => {
    prisma = {
      ownerAccessGrant: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      unitOwnership: {
        findMany: jest.fn(),
      },
      unit: {
        findMany: jest.fn(),
      },
      occupancy: {
        findFirst: jest.fn(),
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
      maintenanceRequest: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      maintenanceRequestComment: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      ownerRequestCommentReadState: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      maintenanceRequestOwnerApprovalAudit: {
        create: jest.fn(),
      },
      $transaction: jest.fn(
        async (callback: (tx: typeof prisma) => Promise<unknown>) =>
          callback(prisma),
      ),
    };
    eventEmitter = { emit: jest.fn() };
    service = new OwnerPortfolioScopeService(
      prisma as unknown as PrismaService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('grants owner runtime access only when an active owner grant exists', async () => {
    prisma.ownerAccessGrant.findFirst.mockResolvedValueOnce({ id: 'grant-1' });
    prisma.ownerAccessGrant.findFirst.mockResolvedValueOnce(null);

    await expect(service.hasActiveOwnerAccess('user-1')).resolves.toBe(true);
    await expect(service.hasActiveOwnerAccess('user-2')).resolves.toBe(false);
    expect(prisma.ownerAccessGrant.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user-1',
        status: OwnerAccessGrantStatus.ACTIVE,
        owner: {
          isActive: true,
        },
      },
      select: { id: true },
    });
  });

  it('returns no units when grants are disabled or owner is inactive', async () => {
    prisma.ownerAccessGrant.findMany.mockResolvedValue([]);

    await expect(service.listAccessibleUnits('user-1')).resolves.toEqual([]);
    expect(prisma.unitOwnership.findMany).not.toHaveBeenCalled();
    expect(prisma.unit.findMany).not.toHaveBeenCalled();
  });

  it('returns the union of active ownership rows plus temporary unit-owner fallback rows', async () => {
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-2' },
      { ownerId: 'owner-1' },
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-1',
          label: 'A-101',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
    ]);
    prisma.unit.findMany.mockResolvedValue([
      {
        id: 'unit-2',
        label: 'B-201',
        ownerId: 'owner-2',
        building: {
          id: 'building-2',
          name: 'Tower B',
          org: { id: 'org-2', name: 'Beta Org' },
        },
      },
    ]);

    await expect(service.listAccessibleUnits('user-1')).resolves.toEqual([
      {
        orgId: 'org-1',
        orgName: 'Alpha Org',
        ownerId: 'owner-1',
        unitId: 'unit-1',
        buildingId: 'building-1',
        buildingName: 'Tower A',
        unitLabel: 'A-101',
      },
      {
        orgId: 'org-2',
        orgName: 'Beta Org',
        ownerId: 'owner-2',
        unitId: 'unit-2',
        buildingId: 'building-2',
        buildingName: 'Tower B',
        unitLabel: 'B-201',
      },
    ]);

    expect(prisma.unitOwnership.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: { in: ['owner-2', 'owner-1'] },
        endDate: null,
        owner: {
          isActive: true,
          accessGrants: {
            some: {
              userId: 'user-1',
              status: OwnerAccessGrantStatus.ACTIVE,
            },
          },
        },
      },
      include: {
        org: { select: { id: true, name: true } },
        unit: {
          select: {
            id: true,
            label: true,
            building: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    expect(prisma.unit.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: { in: ['owner-2', 'owner-1'] },
        owner: {
          isActive: true,
          accessGrants: {
            some: {
              userId: 'user-1',
              status: OwnerAccessGrantStatus.ACTIVE,
            },
          },
        },
        ownerships: {
          none: {
            endDate: null,
          },
        },
      },
      select: {
        id: true,
        label: true,
        ownerId: true,
        building: {
          select: {
            id: true,
            name: true,
            org: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  });

  it('summarizes distinct unit, org, and building counts from accessible units', async () => {
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-2',
          label: 'A-102',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-1',
          label: 'A-101',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
      {
        ownerId: 'owner-1',
        org: { id: 'org-2', name: 'Beta Org' },
        unit: {
          id: 'unit-3',
          label: 'B-201',
          building: { id: 'building-2', name: 'Tower B' },
        },
      },
    ]);
    prisma.unit.findMany.mockResolvedValue([]);

    await expect(service.getPortfolioSummary('user-1')).resolves.toEqual({
      unitCount: 3,
      orgCount: 2,
      buildingCount: 2,
    });
  });

  it('returns the active tenant for an accessible unit', async () => {
    const listAccessibleUnitsSpy = jest.spyOn(service, 'listAccessibleUnits');
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-1',
          label: 'A-101',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
    ]);
    prisma.unit.findMany.mockResolvedValue([]);
    prisma.occupancy.findFirst.mockResolvedValue({
      id: 'occupancy-1',
      residentUser: {
        id: 'tenant-1',
        name: 'Tenant One',
        email: 'tenant-1@test.com',
        phone: '+971500000001',
      },
    });

    await expect(
      service.getAccessibleUnitTenant('user-1', 'unit-1'),
    ).resolves.toEqual({
      occupancyId: 'occupancy-1',
      tenantUserId: 'tenant-1',
      name: 'Tenant One',
      email: 'tenant-1@test.com',
      phone: '+971500000001',
    });
    expect(listAccessibleUnitsSpy).not.toHaveBeenCalled();

    expect(prisma.occupancy.findFirst).toHaveBeenCalledWith({
      where: {
        unitId: 'unit-1',
        status: 'ACTIVE',
        residentUser: {
          isActive: true,
        },
      },
      select: {
        id: true,
        residentUser: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('returns null when an accessible unit has no active tenant', async () => {
    const listAccessibleUnitsSpy = jest.spyOn(service, 'listAccessibleUnits');
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-1',
          label: 'A-101',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
    ]);
    prisma.unit.findMany.mockResolvedValue([]);
    prisma.occupancy.findFirst.mockResolvedValue(null);

    await expect(
      service.getAccessibleUnitTenant('user-1', 'unit-1'),
    ).resolves.toBeNull();
    expect(listAccessibleUnitsSpy).not.toHaveBeenCalled();
  });

  it('rejects tenant lookup for a unit outside the current owner scope', async () => {
    const listAccessibleUnitsSpy = jest.spyOn(service, 'listAccessibleUnits');
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([]);
    prisma.unit.findMany.mockResolvedValue([]);

    await expect(
      service.getAccessibleUnitTenant('user-1', 'unit-404'),
    ).rejects.toThrow('Unit not found');

    expect(listAccessibleUnitsSpy).not.toHaveBeenCalled();
    expect(prisma.occupancy.findFirst).not.toHaveBeenCalled();
  });

  it('lists only requests tied to currently accessible owner units', async () => {
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-1',
          label: 'A-101',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
    ]);
    prisma.unit.findMany.mockResolvedValue([]);
    prisma.maintenanceRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        unitId: 'unit-1',
        title: 'Leaky faucet',
        description: 'Kitchen sink dripping',
        isEmergency: false,
        status: 'OPEN',
        priority: 'HIGH',
        type: 'PLUMBING_AC_HEATING',
        ownerApprovalStatus:
          MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
        ownerApprovalRequestedAt: null,
        ownerApprovalRequestedByUserId: null,
        ownerApprovalDeadlineAt: null,
        ownerApprovalDecidedAt: null,
        ownerApprovalDecidedByOwnerUserId: null,
        ownerApprovalReason: null,
        approvalRequiredReason: null,
        estimatedAmount: null,
        estimatedCurrency: null,
        ownerApprovalDecisionSource: null,
        ownerApprovalOverrideReason: null,
        ownerApprovalOverriddenByUserId: null,
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T01:00:00.000Z'),
        createdByUser: {
          id: 'resident-1',
          name: 'Resident One',
          email: 'resident-1@test.com',
        },
        assignedToUser: null,
        attachments: [],
      },
      {
        id: 'request-out-of-scope',
        unitId: 'unit-404',
        title: 'Ignore me',
        description: null,
        status: 'OPEN',
        priority: null,
        type: null,
        ownerApprovalStatus:
          MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
        ownerApprovalRequestedAt: null,
        ownerApprovalRequestedByUserId: null,
        ownerApprovalDeadlineAt: null,
        ownerApprovalDecidedAt: null,
        ownerApprovalDecidedByOwnerUserId: null,
        ownerApprovalReason: null,
        approvalRequiredReason: null,
        estimatedAmount: null,
        estimatedCurrency: null,
        ownerApprovalDecisionSource: null,
        ownerApprovalOverrideReason: null,
        ownerApprovalOverriddenByUserId: null,
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        updatedAt: new Date('2026-04-04T01:00:00.000Z'),
        createdByUser: {
          id: 'resident-2',
          name: 'Resident Two',
          email: 'resident-2@test.com',
        },
        assignedToUser: null,
        attachments: [],
      },
    ]);

    prisma.occupancy.findMany
      .mockResolvedValueOnce([
        {
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
      .mockResolvedValue([]);

    await expect(service.listAccessibleRequests('user-1')).resolves.toEqual([
      {
        id: 'request-1',
        orgId: 'org-1',
        orgName: 'Alpha Org',
        ownerId: 'owner-1',
        buildingId: 'building-1',
        buildingName: 'Tower A',
        unitId: 'unit-1',
        unitLabel: 'A-101',
        title: 'Leaky faucet',
        description: 'Kitchen sink dripping',
        isEmergency: false,
        status: 'OPEN',
        priority: 'HIGH',
        type: 'PLUMBING_AC_HEATING',
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T01:00:00.000Z'),
        createdBy: {
          id: 'resident-1',
          name: 'Resident One',
          email: 'resident-1@test.com',
        },
        requesterContext: {
          isResident: true,
          residentOccupancyStatus: 'ACTIVE',
          residentInviteStatus: null,
          isFormerResident: false,
          currentUnitOccupiedByRequester: true,
          currentUnitOccupant: {
            userId: 'resident-1',
            name: 'Resident One',
          },
        },
        requestTenancyContext: {
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
        },
        assignedTo: null,
        attachments: [],
        ownerApprovalStatus:
          MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
        ownerApprovalRequestedAt: null,
        ownerApprovalRequestedByUserId: null,
        ownerApprovalDeadlineAt: null,
        ownerApprovalDecidedAt: null,
        ownerApprovalDecidedByOwnerUserId: null,
        ownerApprovalReason: null,
        approvalRequiredReason: null,
        estimatedAmount: null,
        estimatedCurrency: null,
        ownerApprovalDecisionSource: null,
        ownerApprovalOverrideReason: null,
        ownerApprovalOverriddenByUserId: null,
        occupancyIdAtCreation: null,
        leaseIdAtCreation: null,
      },
    ]);
  });

  it('returns request detail only when the request remains inside current owner scope', async () => {
    const listAccessibleRequestsSpy = jest.spyOn(
      service,
      'listAccessibleRequests',
    );
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-1',
          label: 'A-101',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
    ]);
    prisma.unit.findMany.mockResolvedValue([]);
    prisma.maintenanceRequest.findFirst
      .mockResolvedValueOnce({
        id: 'request-1',
        orgId: 'org-1',
        unitId: 'unit-1',
        title: 'Leaky faucet',
        description: null,
        status: 'ASSIGNED',
        priority: null,
        type: null,
        ownerApprovalStatus:
          MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
        ownerApprovalRequestedAt: null,
        ownerApprovalRequestedByUserId: null,
        ownerApprovalDeadlineAt: null,
        ownerApprovalDecidedAt: null,
        ownerApprovalDecidedByOwnerUserId: null,
        ownerApprovalReason: null,
        approvalRequiredReason: null,
        estimatedAmount: null,
        estimatedCurrency: null,
        ownerApprovalDecisionSource: null,
        ownerApprovalOverrideReason: null,
        ownerApprovalOverriddenByUserId: null,
        occupancyIdAtCreation: null,
        leaseIdAtCreation: null,
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
        updatedAt: new Date('2026-04-05T01:00:00.000Z'),
        createdByUser: {
          id: 'resident-1',
          name: null,
          email: 'resident-1@test.com',
        },
        assignedToUser: {
          id: 'staff-1',
          name: 'Staff One',
          email: 'staff-1@test.com',
        },
        attachments: [],
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.getAccessibleRequestById('user-1', 'request-1'),
    ).resolves.toMatchObject({
      id: 'request-1',
      ownerId: 'owner-1',
      unitId: 'unit-1',
      status: 'ASSIGNED',
    });
    expect(listAccessibleRequestsSpy).not.toHaveBeenCalled();
    expect(prisma.maintenanceRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        unitId: { in: ['unit-1'] },
      },
      include: expect.any(Object),
    });

    await expect(
      service.getAccessibleRequestById('user-1', 'request-404'),
    ).rejects.toThrow('Request not found');
    expect(listAccessibleRequestsSpy).not.toHaveBeenCalled();
  });

  it('approves an in-scope pending request and records owner audit state', async () => {
    jest.spyOn(service, 'getAccessibleRequestById').mockResolvedValueOnce({
      id: 'request-1',
      orgId: 'org-1',
      orgName: 'Alpha Org',
      ownerId: 'owner-1',
      buildingId: 'building-1',
      buildingName: 'Tower A',
      unitId: 'unit-1',
      unitLabel: 'A-101',
      title: 'Leaky faucet',
      description: null,
      status: 'OPEN',
      priority: null,
      type: null,
      createdAt: new Date('2026-04-05T00:00:00.000Z'),
      updatedAt: new Date('2026-04-05T01:00:00.000Z'),
      createdBy: {
        id: 'resident-1',
        name: 'Resident One',
        email: 'resident-1@test.com',
      },
      assignedTo: null,
      attachments: [],
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatusEnum.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: 'manager-1',
      ownerApprovalDeadlineAt: null,
      ownerApprovalDecidedAt: null,
      ownerApprovalDecidedByOwnerUserId: null,
      ownerApprovalReason: null,
      approvalRequiredReason: 'Estimate threshold',
      estimatedAmount: '450',
      estimatedCurrency: 'AED',
      ownerApprovalDecisionSource: null,
      ownerApprovalOverrideReason: null,
      ownerApprovalOverriddenByUserId: null,
    } as never);
    prisma.maintenanceRequest.update.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      unitId: 'unit-1',
      title: 'Leaky faucet',
      description: null,
      status: 'OPEN',
      priority: null,
      type: null,
      createdAt: new Date('2026-04-05T00:00:00.000Z'),
      updatedAt: new Date('2026-04-05T02:00:00.000Z'),
      createdByUser: {
        id: 'resident-1',
        name: 'Resident One',
        email: 'resident-1@test.com',
      },
      assignedToUser: null,
      attachments: [],
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.APPROVED,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: 'manager-1',
      ownerApprovalDeadlineAt: null,
      ownerApprovalDecidedAt: new Date('2026-04-05T02:00:00.000Z'),
      ownerApprovalDecidedByOwnerUserId: 'user-1',
      ownerApprovalReason: 'Proceed',
      approvalRequiredReason: 'Estimate threshold',
      estimatedAmount: { toString: () => '450' },
      estimatedCurrency: 'AED',
      ownerApprovalDecisionSource:
        MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
      ownerApprovalOverrideReason: null,
      ownerApprovalOverriddenByUserId: null,
    });

    await expect(
      service.approveAccessibleRequest('user-1', 'request-1', 'Proceed'),
    ).resolves.toMatchObject({
      id: 'request-1',
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.APPROVED,
      ownerApprovalReason: 'Proceed',
      ownerApprovalDecisionSource:
        MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
      ownerApprovalDecidedByOwnerUserId: 'user-1',
    });

    expect(prisma.maintenanceRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: expect.objectContaining({
        ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.APPROVED,
        ownerApprovalReason: 'Proceed',
      }),
      include: expect.any(Object),
    });
    expect(
      prisma.maintenanceRequestOwnerApprovalAudit.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request-1',
        actorUserId: 'user-1',
        action: 'APPROVED',
        fromStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
        toStatus: MaintenanceRequestOwnerApprovalStatus.APPROVED,
      }),
    });
  });

  it('rejects an in-scope pending request and records owner audit state', async () => {
    jest.spyOn(service, 'getAccessibleRequestById').mockResolvedValueOnce({
      id: 'request-1',
      orgId: 'org-1',
      orgName: 'Alpha Org',
      ownerId: 'owner-1',
      buildingId: 'building-1',
      buildingName: 'Tower A',
      unitId: 'unit-1',
      unitLabel: 'A-101',
      title: 'Leaky faucet',
      description: null,
      status: 'OPEN',
      priority: null,
      type: null,
      createdAt: new Date('2026-04-05T00:00:00.000Z'),
      updatedAt: new Date('2026-04-05T01:00:00.000Z'),
      createdBy: {
        id: 'resident-1',
        name: 'Resident One',
        email: 'resident-1@test.com',
      },
      assignedTo: null,
      attachments: [],
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatusEnum.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: 'manager-1',
      ownerApprovalDeadlineAt: null,
      ownerApprovalDecidedAt: null,
      ownerApprovalDecidedByOwnerUserId: null,
      ownerApprovalReason: null,
      approvalRequiredReason: 'Estimate threshold',
      estimatedAmount: '450',
      estimatedCurrency: 'AED',
      ownerApprovalDecisionSource: null,
      ownerApprovalOverrideReason: null,
      ownerApprovalOverriddenByUserId: null,
    } as never);
    prisma.maintenanceRequest.update.mockResolvedValue({
      id: 'request-1',
      orgId: 'org-1',
      unitId: 'unit-1',
      title: 'Leaky faucet',
      description: null,
      status: 'OPEN',
      priority: null,
      type: null,
      createdAt: new Date('2026-04-05T00:00:00.000Z'),
      updatedAt: new Date('2026-04-05T02:00:00.000Z'),
      createdByUser: {
        id: 'resident-1',
        name: 'Resident One',
        email: 'resident-1@test.com',
      },
      assignedToUser: null,
      attachments: [],
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.REJECTED,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: 'manager-1',
      ownerApprovalDeadlineAt: null,
      ownerApprovalDecidedAt: new Date('2026-04-05T02:00:00.000Z'),
      ownerApprovalDecidedByOwnerUserId: 'user-1',
      ownerApprovalReason: 'Need second quote',
      approvalRequiredReason: 'Estimate threshold',
      estimatedAmount: { toString: () => '450' },
      estimatedCurrency: 'AED',
      ownerApprovalDecisionSource:
        MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
      ownerApprovalOverrideReason: null,
      ownerApprovalOverriddenByUserId: null,
    });

    await expect(
      service.rejectAccessibleRequest(
        'user-1',
        'request-1',
        'Need second quote',
      ),
    ).resolves.toMatchObject({
      id: 'request-1',
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.REJECTED,
      ownerApprovalReason: 'Need second quote',
      ownerApprovalDecisionSource:
        MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
      ownerApprovalDecidedByOwnerUserId: 'user-1',
    });

    expect(
      prisma.maintenanceRequestOwnerApprovalAudit.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request-1',
        actorUserId: 'user-1',
        action: 'REJECTED',
        fromStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
        toStatus: MaintenanceRequestOwnerApprovalStatus.REJECTED,
      }),
    });
  });

  it('lists only shared comments for an accessible owner request', async () => {
    jest.spyOn(service, 'getAccessibleRequestById').mockResolvedValueOnce({
      id: 'request-1',
      orgId: 'org-1',
      orgName: 'Alpha Org',
      ownerId: 'owner-1',
      buildingId: 'building-1',
      buildingName: 'Tower A',
      unitId: 'unit-1',
      unitLabel: 'A-101',
      title: 'Leaky faucet',
      description: null,
      status: 'OPEN',
      priority: null,
      type: null,
      createdAt: new Date('2026-04-05T00:00:00.000Z'),
      updatedAt: new Date('2026-04-05T01:00:00.000Z'),
      createdBy: {
        id: 'resident-1',
        name: 'Resident One',
        email: 'resident-1@test.com',
      },
      assignedTo: null,
      attachments: [],
      ownerApprovalStatus:
        MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
      ownerApprovalRequestedAt: null,
      ownerApprovalRequestedByUserId: null,
      ownerApprovalDeadlineAt: null,
      ownerApprovalDecidedAt: null,
      ownerApprovalDecidedByOwnerUserId: null,
      ownerApprovalReason: null,
      approvalRequiredReason: null,
      estimatedAmount: null,
      estimatedCurrency: null,
      ownerApprovalDecisionSource: null,
      ownerApprovalOverrideReason: null,
      ownerApprovalOverriddenByUserId: null,
    } as never);
    prisma.maintenanceRequestComment.findMany.mockResolvedValue([
      {
        id: 'comment-1',
        requestId: 'request-1',
        message: 'Shared note',
        createdAt: new Date('2026-04-05T03:00:00.000Z'),
        visibility: 'SHARED',
        authorType: 'TENANT',
        authorOwnerId: null,
        authorUser: {
          id: 'resident-1',
          name: 'Resident One',
          email: 'resident-1@test.com',
        },
      },
    ]);

    await expect(
      service.listAccessibleRequestComments('user-1', 'request-1'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'comment-1',
        requestId: 'request-1',
        visibility: 'SHARED',
        authorType: 'TENANT',
      }),
    ]);

    expect(prisma.maintenanceRequestComment.findMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        requestId: 'request-1',
        visibility: 'SHARED',
      },
      include: {
        authorUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.ownerRequestCommentReadState.upsert).toHaveBeenCalledWith({
      where: {
        userId_requestId: {
          userId: 'user-1',
          requestId: 'request-1',
        },
      },
      update: {
        lastReadAt: new Date('2026-04-05T03:00:00.000Z'),
      },
      create: {
        userId: 'user-1',
        requestId: 'request-1',
        lastReadAt: new Date('2026-04-05T03:00:00.000Z'),
      },
    });
  });

  it('counts unread shared comments across accessible requests using the owner read state', async () => {
    const listAccessibleRequestsSpy = jest.spyOn(
      service,
      'listAccessibleRequests',
    );
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { ownerId: 'owner-1' },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-1',
          label: 'A-101',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
      {
        ownerId: 'owner-1',
        org: { id: 'org-1', name: 'Alpha Org' },
        unit: {
          id: 'unit-2',
          label: 'A-102',
          building: { id: 'building-1', name: 'Tower A' },
        },
      },
    ]);
    prisma.unit.findMany.mockResolvedValue([]);
    prisma.maintenanceRequest.findMany.mockResolvedValue([
      { id: 'request-1' },
      { id: 'request-2' },
    ]);
    prisma.ownerRequestCommentReadState.findMany.mockResolvedValue([
      {
        requestId: 'request-1',
        lastReadAt: new Date('2026-04-05T03:00:00.000Z'),
      },
    ]);
    prisma.maintenanceRequestComment.findMany.mockResolvedValue([
      {
        requestId: 'request-1',
        createdAt: new Date('2026-04-05T04:00:00.000Z'),
      },
      {
        requestId: 'request-2',
        createdAt: new Date('2026-04-05T02:00:00.000Z'),
      },
    ]);

    await expect(
      service.countUnreadAccessibleRequestComments('user-1'),
    ).resolves.toBe(2);
    expect(listAccessibleRequestsSpy).not.toHaveBeenCalled();
    expect(prisma.maintenanceRequest.findMany).toHaveBeenCalledWith({
      where: {
        unitId: { in: ['unit-1', 'unit-2'] },
      },
      select: {
        id: true,
      },
    });

    expect(prisma.ownerRequestCommentReadState.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        requestId: { in: ['request-1', 'request-2'] },
      },
      select: {
        requestId: true,
        lastReadAt: true,
      },
    });
    expect(prisma.maintenanceRequestComment.findMany).toHaveBeenCalledWith({
      where: {
        requestId: { in: ['request-1', 'request-2'] },
        visibility: 'SHARED',
        authorUserId: { not: 'user-1' },
      },
      select: {
        requestId: true,
        createdAt: true,
      },
    });
  });

  it('adds a shared owner comment for an accessible request and emits the shared comment event', async () => {
    jest.spyOn(service, 'getAccessibleRequestById').mockResolvedValueOnce({
      id: 'request-1',
      orgId: 'org-1',
      orgName: 'Alpha Org',
      ownerId: 'owner-1',
      buildingId: 'building-1',
      buildingName: 'Tower A',
      unitId: 'unit-1',
      unitLabel: 'A-101',
      title: 'Leaky faucet',
      description: null,
      status: 'OPEN',
      priority: null,
      type: null,
      createdAt: new Date('2026-04-05T00:00:00.000Z'),
      updatedAt: new Date('2026-04-05T01:00:00.000Z'),
      createdBy: {
        id: 'resident-1',
        name: 'Resident One',
        email: 'resident-1@test.com',
      },
      assignedTo: null,
      attachments: [],
      ownerApprovalStatus:
        MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
      ownerApprovalRequestedAt: null,
      ownerApprovalRequestedByUserId: null,
      ownerApprovalDeadlineAt: null,
      ownerApprovalDecidedAt: null,
      ownerApprovalDecidedByOwnerUserId: null,
      ownerApprovalReason: null,
      approvalRequiredReason: null,
      estimatedAmount: null,
      estimatedCurrency: null,
      ownerApprovalDecisionSource: null,
      ownerApprovalOverrideReason: null,
      ownerApprovalOverriddenByUserId: null,
    } as never);
    prisma.maintenanceRequestComment.create.mockResolvedValue({
      id: 'comment-1',
      requestId: 'request-1',
      orgId: 'org-1',
      message: 'Owner shared comment',
      createdAt: new Date('2026-04-05T03:00:00.000Z'),
      visibility: 'SHARED',
      authorType: 'OWNER',
      authorOwnerId: 'owner-1',
      authorUser: {
        id: 'user-1',
        name: 'Owner User',
        email: 'owner@test.com',
      },
    });

    await expect(
      service.addAccessibleRequestComment('user-1', 'request-1', {
        message: 'Owner shared comment',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'comment-1',
        authorType: 'OWNER',
        visibility: 'SHARED',
        authorOwnerId: 'owner-1',
      }),
    );

    expect(prisma.maintenanceRequestComment.create).toHaveBeenCalledWith({
      data: {
        request: { connect: { id: 'request-1' } },
        org: { connect: { id: 'org-1' } },
        authorUser: { connect: { id: 'user-1' } },
        authorOwner: { connect: { id: 'owner-1' } },
        authorType: 'OWNER',
        visibility: 'SHARED',
        message: 'Owner shared comment',
      },
      include: {
        authorUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    expect(prisma.ownerRequestCommentReadState.upsert).toHaveBeenCalledWith({
      where: {
        userId_requestId: {
          userId: 'user-1',
          requestId: 'request-1',
        },
      },
      update: {
        lastReadAt: new Date('2026-04-05T03:00:00.000Z'),
      },
      create: {
        userId: 'user-1',
        requestId: 'request-1',
        lastReadAt: new Date('2026-04-05T03:00:00.000Z'),
      },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'maintenance.request.commented',
      expect.objectContaining({
        actorUserId: 'user-1',
        comment: {
          id: 'comment-1',
          message: 'Owner shared comment',
        },
      }),
    );
  });
});

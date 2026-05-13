import { OwnerAccessGrantStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationRecipientResolver } from './notification-recipient.resolver';

describe('NotificationRecipientResolver', () => {
  let prisma: {
    userAccessAssignment: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
    serviceProviderUser: { findMany: jest.Mock };
    ownerAccessGrant: { findMany: jest.Mock };
    unitOwnership: { findMany: jest.Mock };
    unit: { findFirst: jest.Mock };
  };
  let resolver: NotificationRecipientResolver;

  beforeEach(() => {
    prisma = {
      userAccessAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceProviderUser: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ownerAccessGrant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      unitOwnership: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      unit: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    resolver = new NotificationRecipientResolver(
      prisma as never as PrismaService,
    );
  });

  it('adds active owner recipients to shared request comments', async () => {
    prisma.userAccessAssignment.findMany.mockResolvedValue([
      {
        userId: 'manager-1',
        user: { id: 'manager-1', isActive: true, orgId: 'org-1' },
      },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([{ ownerId: 'owner-1' }]);
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { userId: 'owner-user-1' },
    ]);

    const recipients = await resolver.resolveForRequestCommented(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        assignedToUserId: 'staff-1',
      },
      'resident-1',
      true,
    );

    expect(recipients).toEqual(
      new Set(['staff-1', 'manager-1', 'owner-user-1']),
    );
  });

  it('resolves provider managers when a request is assigned to a provider', async () => {
    prisma.serviceProviderUser.findMany.mockResolvedValue([
      {
        userId: 'provider-manager-1',
        user: {
          id: 'provider-manager-1',
          isActive: true,
          orgId: 'org-1',
        },
      },
      {
        userId: 'provider-manager-2',
        user: {
          id: 'provider-manager-2',
          isActive: true,
          orgId: 'org-1',
        },
      },
    ]);

    const recipients = await resolver.resolveForRequestAssigned(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
      },
      'building-manager-1',
    );

    expect(recipients).toEqual(
      new Set(['provider-manager-1', 'provider-manager-2']),
    );
    expect(prisma.serviceProviderUser.findMany).toHaveBeenCalledWith({
      where: {
        serviceProviderId: 'provider-1',
        role: 'ADMIN',
        isActive: true,
        user: {
          isActive: true,
        },
        serviceProvider: {
          isActive: true,
        },
      },
      include: {
        user: true,
      },
    });
  });

  it('resolves only the assigned provider worker when dispatched', async () => {
    const recipients = await resolver.resolveForRequestAssigned(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
        serviceProviderAssignedUserId: 'provider-worker-1',
      },
      'provider-manager-1',
    );

    expect(recipients).toEqual(new Set(['provider-worker-1']));
    expect(prisma.serviceProviderUser.findMany).not.toHaveBeenCalled();
  });

  it('resolves owner approval recipients from active ownership grants', async () => {
    prisma.unitOwnership.findMany.mockResolvedValue([{ ownerId: 'owner-1' }]);
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { userId: 'owner-user-1' },
      { userId: 'owner-user-2' },
    ]);

    const recipients = await resolver.resolveForOwnerApprovalRequested(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
      },
      'manager-1',
    );

    expect(recipients).toEqual(new Set(['owner-user-1', 'owner-user-2']));
    expect(prisma.ownerAccessGrant.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: {
          in: ['owner-1'],
        },
        status: OwnerAccessGrantStatus.ACTIVE,
        userId: {
          not: null,
        },
        owner: {
          isActive: true,
        },
      },
      select: {
        userId: true,
      },
    });
  });

  it('falls back to Unit.ownerId when no active ownership row exists', async () => {
    prisma.unit.findFirst.mockResolvedValue({ ownerId: 'owner-fallback' });
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { userId: 'owner-user-1' },
    ]);

    const recipients = await resolver.resolveForOwnerRequestOverridden(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
      },
      'manager-1',
    );

    expect(recipients).toEqual(new Set(['resident-1', 'owner-user-1']));
    expect(prisma.unit.findFirst).toHaveBeenCalled();
  });

  it('adds owner recipients on emergency assignment dispatch', async () => {
    prisma.serviceProviderUser.findMany.mockResolvedValue([
      {
        userId: 'provider-manager-1',
        user: {
          id: 'provider-manager-1',
          isActive: true,
          orgId: 'org-1',
        },
      },
    ]);
    prisma.unitOwnership.findMany.mockResolvedValue([{ ownerId: 'owner-1' }]);
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      { userId: 'owner-user-1' },
    ]);

    const recipients = await resolver.resolveForRequestAssigned(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
        isEmergency: true,
      },
      'manager-1',
    );

    expect(recipients).toEqual(new Set(['provider-manager-1', 'owner-user-1']));
  });

  it('includes displaced provider managers when a request is unassigned from a provider', async () => {
    prisma.userAccessAssignment.findMany.mockResolvedValue([
      {
        userId: 'manager-1',
        user: { id: 'manager-1', isActive: true, orgId: 'org-1' },
      },
    ]);
    prisma.serviceProviderUser.findMany.mockResolvedValue([
      {
        userId: 'provider-manager-1',
        user: {
          id: 'provider-manager-1',
          isActive: true,
          orgId: 'org-1',
        },
      },
    ]);

    const recipients = await resolver.resolveForRequestStatusChanged(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        title: 'Leak',
        status: 'OPEN',
        createdByUserId: 'resident-1',
      },
      'building-manager-1',
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        title: 'Leak',
        status: 'ASSIGNED',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
        serviceProviderAssignedUserId: 'provider-worker-1',
      },
    );

    expect(recipients).toEqual(
      new Set([
        'resident-1',
        'manager-1',
        'provider-manager-1',
        'provider-worker-1',
      ]),
    );
  });

  it('includes displaced staff when a request is reassigned to a provider', async () => {
    prisma.serviceProviderUser.findMany.mockResolvedValue([
      {
        userId: 'provider-manager-1',
        user: {
          id: 'provider-manager-1',
          isActive: true,
          orgId: 'org-1',
        },
      },
    ]);

    const recipients = await resolver.resolveForRequestAssigned(
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
      },
      'building-manager-1',
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        assignedToUserId: 'staff-1',
      },
    );

    expect(recipients).toEqual(new Set(['provider-manager-1', 'staff-1']));
  });
});

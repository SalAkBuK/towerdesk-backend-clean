import { NotificationTypeEnum } from './notifications.constants';
import { NotificationsListener } from './notifications.listener';

describe('NotificationsListener', () => {
  const notificationsService = {
    createForUsers: jest.fn(),
  };
  const recipientResolver = {
    resolveForRequestAssigned: jest.fn(),
    resolveForRequestStatusChanged: jest.fn(),
    resolveForEstimateReminder: jest.fn(),
    resolveForOwnerApprovalRequested: jest.fn(),
    resolveForOwnerRequestRejected: jest.fn(),
  };

  let listener: NotificationsListener;

  beforeEach(() => {
    jest.clearAllMocks();
    notificationsService.createForUsers.mockResolvedValue([]);
    recipientResolver.resolveForRequestAssigned.mockResolvedValue(
      new Set(['provider-manager-1']),
    );
    recipientResolver.resolveForRequestStatusChanged.mockResolvedValue(
      new Set(['building-manager-1', 'building-admin-1']),
    );
    recipientResolver.resolveForEstimateReminder.mockResolvedValue(
      new Set(['building-manager-1']),
    );
    recipientResolver.resolveForOwnerApprovalRequested.mockResolvedValue(
      new Set(['owner-user-1']),
    );
    recipientResolver.resolveForOwnerRequestRejected.mockResolvedValue(
      new Set(['owner-user-1']),
    );
    listener = new NotificationsListener(
      notificationsService as never,
      recipientResolver as never,
    );
  });

  it('creates provider assignment notifications for provider managers', async () => {
    await listener.handleRequestAssigned({
      actorUserId: 'building-manager-1',
      request: {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
        unit: { id: 'unit-1', label: 'A-101' },
      },
    });

    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['provider-manager-1'],
      type: NotificationTypeEnum.REQUEST_ASSIGNED,
      title: 'Request assigned',
      body: 'Unit A-101: Leak',
      data: {
        requestId: 'request-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        actorUserId: 'building-manager-1',
        status: undefined,
        ownerApprovalStatus: undefined,
        isEmergency: false,
        commentId: undefined,
      },
    });
  });

  it('creates status notifications for building-side recipients when a provider completes a request', async () => {
    await listener.handleRequestStatusChanged({
      actorUserId: 'provider-worker-1',
      request: {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        status: 'COMPLETED',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
        serviceProviderAssignedUserId: 'provider-worker-1',
        unit: { id: 'unit-1', label: 'A-101' },
      },
    });

    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['building-manager-1', 'building-admin-1'],
      type: NotificationTypeEnum.REQUEST_STATUS_CHANGED,
      title: 'Request status updated',
      body: 'COMPLETED',
      data: {
        requestId: 'request-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        actorUserId: 'provider-worker-1',
        status: 'COMPLETED',
        ownerApprovalStatus: undefined,
        isEmergency: false,
        commentId: undefined,
      },
    });
  });

  it('creates owner approval requested notifications', async () => {
    await listener.handleOwnerApprovalRequested({
      actorUserId: 'manager-1',
      request: {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        createdByUserId: 'resident-1',
        unit: { id: 'unit-1', label: 'A-101' },
      },
    });

    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['owner-user-1'],
      type: NotificationTypeEnum.OWNER_APPROVAL_REQUESTED,
      title: 'Owner approval requested',
      body: 'Unit A-101: Leak',
      data: {
        requestId: 'request-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        actorUserId: 'manager-1',
        status: undefined,
        ownerApprovalStatus: undefined,
        isEmergency: false,
        commentId: undefined,
      },
    });
  });

  it('creates estimate reminder notifications for building-side recipients', async () => {
    await listener.handleEstimateReminder({
      actorUserId: 'system',
      request: {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'AC not cooling',
        status: 'OPEN',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
        unit: { id: 'unit-1', label: 'A-101' },
      },
    });

    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['building-manager-1'],
      type: NotificationTypeEnum.ESTIMATE_REMINDER,
      title: 'Estimate overdue',
      body: 'Unit A-101: AC not cooling',
      data: {
        requestId: 'request-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        actorUserId: 'system',
        status: 'OPEN',
        ownerApprovalStatus: undefined,
        isEmergency: false,
        commentId: undefined,
      },
    });
  });

  it('creates owner request rejected notifications', async () => {
    await listener.handleOwnerRequestRejected({
      actorUserId: 'owner-user-1',
      request: {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'Leak',
        status: 'OPEN',
        createdByUserId: 'resident-1',
        unit: { id: 'unit-1', label: 'A-101' },
      },
    });

    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['owner-user-1'],
      type: NotificationTypeEnum.OWNER_REQUEST_REJECTED,
      title: 'Request rejected',
      body: 'Unit A-101: Leak',
      data: {
        requestId: 'request-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        actorUserId: 'owner-user-1',
        status: 'OPEN',
        ownerApprovalStatus: undefined,
        isEmergency: false,
        commentId: undefined,
      },
    });
  });
});

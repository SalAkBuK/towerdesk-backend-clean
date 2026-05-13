import { MessagingService } from './messaging.service';
import { NotificationTypeEnum } from '../notifications/notifications.constants';
import {
  ConversationCounterpartyGroup,
  ConversationType,
} from '@prisma/client';

describe('MessagingService', () => {
  const messagingRepo = {
    validateUsersInOrg: jest.fn(),
    createConversation: jest.fn(),
    findConversationByIdForUser: jest.fn(),
    listConversationsForUser: jest.fn(),
    isUserParticipant: jest.fn(),
    addMessage: jest.fn(),
    getConversationParticipantUserIds: jest.fn(),
    getConversationParticipantRoleBuckets: jest.fn(),
    getUserBuildingIdsWithPermission: jest.fn(),
    getActiveResidentUserIdsInBuilding: jest.fn(),
    getManagementUserIdsForBuilding: jest.fn(),
    listManagementUsersForBuilding: jest.fn(),
    getActiveOwnerUserIdsForUnit: jest.fn(),
    findActiveOccupancyForResidentInUnit: jest.fn(),
    findActiveOccupancyByResident: jest.fn(),
    hasOccupancyHistoryByResident: jest.fn(),
    findConversationByIdForUserAcrossOrgs: jest.fn(),
    listConversationsForUserAcrossOrgs: jest.fn(),
    countUnreadMessagesForUser: jest.fn(),
    countUnreadMessagesForUserAcrossOrgs: jest.fn(),
  };
  const accessControlService = {
    getUserEffectivePermissions: jest.fn(),
    getUserScopedAssignments: jest.fn(),
  };
  const buildingAccessService = {
    assertBuildingInOrg: jest.fn(),
  };
  const realtimeService = {
    publishToUser: jest.fn(),
  };
  const notificationsService = {
    createForUsers: jest.fn(),
  };
  const ownerPortfolioScopeService = {
    listAccessibleUnits: jest.fn(),
    getAccessibleUnitOrThrow: jest.fn(),
  };

  let service: MessagingService;

  beforeEach(() => {
    jest.clearAllMocks();
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set<string>(),
    );
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [],
      rolePermissionKeys: [],
      userOverrides: [],
    });
    messagingRepo.getUserBuildingIdsWithPermission.mockResolvedValue([]);
    messagingRepo.getConversationParticipantRoleBuckets.mockResolvedValue({
      staffUserIds: ['sender-1'],
      tenantUserIds: [],
      ownerUserIds: [],
    });
    messagingRepo.findActiveOccupancyByResident.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    messagingRepo.hasOccupancyHistoryByResident.mockResolvedValue(false);
    notificationsService.createForUsers.mockResolvedValue([]);

    service = new MessagingService(
      messagingRepo as never,
      accessControlService as never,
      buildingAccessService as never,
      realtimeService as never,
      notificationsService as never,
      ownerPortfolioScopeService as never,
    );
  });

  it('stores a notification for a new reply and lets notifications own push delivery', async () => {
    messagingRepo.isUserParticipant.mockResolvedValue(true);
    messagingRepo.addMessage.mockResolvedValue({
      id: 'message-1',
      content: 'Hello there',
      senderUser: { id: 'sender-1', name: 'Alice' },
    });
    messagingRepo.getConversationParticipantUserIds.mockResolvedValue([
      'sender-1',
      'recipient-1',
      'recipient-2',
    ]);

    await service.sendMessage(
      { sub: 'sender-1', email: 'alice@example.com', orgId: 'org-1' },
      'org-1',
      'conversation-1',
      '  Hello   there  ',
    );

    expect(realtimeService.publishToUser).toHaveBeenCalledTimes(2);
    expect(notificationsService.createForUsers).toHaveBeenCalledTimes(1);
    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['recipient-1', 'recipient-2'],
      type: NotificationTypeEnum.MESSAGE_CREATED,
      title: 'New message from Alice',
      body: 'Hello there',
      data: {
        kind: 'message',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        senderUserId: 'sender-1',
      },
    });
  });

  it('stores a notification for a newly created conversation', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['messaging.write']),
    );
    messagingRepo.validateUsersInOrg.mockResolvedValue(['recipient-1']);
    messagingRepo.getConversationParticipantRoleBuckets.mockResolvedValue({
      staffUserIds: ['sender-1'],
      tenantUserIds: ['recipient-1'],
      ownerUserIds: [],
    });
    messagingRepo.createConversation.mockResolvedValue({
      id: 'conversation-1',
      subject: null,
      messages: [
        {
          id: 'message-1',
          content: 'Need help with access',
          senderUser: { id: 'sender-1', name: 'Alice' },
        },
      ],
    });

    await service.createConversation(
      { sub: 'sender-1', email: 'alice@example.com', orgId: 'org-1' },
      'org-1',
      {
        participantUserIds: ['recipient-1'],
        message: 'Need help with access',
      },
    );

    expect(realtimeService.publishToUser).toHaveBeenCalledWith(
      'org-1',
      'recipient-1',
      'conversation:new',
      {
        conversationId: 'conversation-1',
        subject: null,
      },
    );
    expect(notificationsService.createForUsers).toHaveBeenCalledTimes(1);
    expect(notificationsService.createForUsers).toHaveBeenCalledWith({
      orgId: 'org-1',
      userIds: ['recipient-1'],
      type: NotificationTypeEnum.CONVERSATION_CREATED,
      title: 'New conversation from Alice',
      body: 'Need help with access',
      data: {
        kind: 'conversation',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        senderUserId: 'sender-1',
      },
    });
  });

  it('treats org-scoped messaging.write as org-wide authority', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['messaging.write']),
    );
    messagingRepo.validateUsersInOrg.mockResolvedValue([
      'recipient-1',
      'recipient-2',
    ]);
    messagingRepo.getConversationParticipantRoleBuckets.mockResolvedValue({
      staffUserIds: ['sender-1', 'recipient-1', 'recipient-2'],
      tenantUserIds: [],
      ownerUserIds: [],
    });
    messagingRepo.createConversation.mockResolvedValue({
      id: 'conversation-1',
      subject: 'Ops',
      messages: [
        {
          id: 'message-1',
          content: 'Org-wide update',
          senderUser: { id: 'sender-1', name: 'Alice' },
        },
      ],
    });

    await service.createConversation(
      { sub: 'sender-1', email: 'alice@example.com', orgId: 'org-1' },
      'org-1',
      {
        participantUserIds: ['recipient-1', 'recipient-2'],
        buildingId: 'building-1',
        subject: 'Ops',
        message: 'Org-wide update',
      },
    );

    expect(buildingAccessService.assertBuildingInOrg).toHaveBeenCalledWith(
      'building-1',
      'org-1',
    );
    expect(
      messagingRepo.getUserBuildingIdsWithPermission,
    ).not.toHaveBeenCalled();
    expect(
      messagingRepo.getActiveResidentUserIdsInBuilding,
    ).not.toHaveBeenCalled();
  });

  it('requires a building for building-scoped messaging senders', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );
    messagingRepo.validateUsersInOrg.mockResolvedValue(['recipient-1']);

    await expect(
      service.createConversation(
        { sub: 'sender-1', email: 'alice@example.com', orgId: 'org-1' },
        'org-1',
        {
          participantUserIds: ['recipient-1'],
          message: 'Need help with access',
        },
      ),
    ).rejects.toThrow('buildingId is required for building-scoped messaging');
  });

  it('uses building-scoped messaging.write to authorize conversations in the requested building', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );
    messagingRepo.getUserBuildingIdsWithPermission.mockResolvedValue([
      'building-9',
    ]);
    messagingRepo.getActiveResidentUserIdsInBuilding.mockResolvedValue([
      'recipient-1',
    ]);
    messagingRepo.validateUsersInOrg.mockResolvedValue(['recipient-1']);
    messagingRepo.getConversationParticipantRoleBuckets.mockResolvedValue({
      staffUserIds: ['sender-1'],
      tenantUserIds: ['recipient-1'],
      ownerUserIds: [],
    });
    messagingRepo.createConversation.mockResolvedValue({
      id: 'conversation-9',
      subject: null,
      messages: [
        {
          id: 'message-9',
          content: 'Building-scoped hello',
          senderUser: { id: 'sender-1', name: 'Alice' },
        },
      ],
    });

    await service.createConversation(
      { sub: 'sender-1', email: 'alice@example.com', orgId: 'org-1' },
      'org-1',
      {
        participantUserIds: ['recipient-1'],
        buildingId: 'building-9',
        message: 'Building-scoped hello',
      },
    );

    expect(messagingRepo.getUserBuildingIdsWithPermission).toHaveBeenCalledWith(
      'sender-1',
      'org-1',
      'messaging.write',
    );
  });

  it('creates owner-to-management conversations from the owner unit scope', async () => {
    ownerPortfolioScopeService.getAccessibleUnitOrThrow.mockResolvedValue({
      orgId: 'org-1',
      orgName: 'Org 1',
      ownerId: 'owner-1',
      unitId: 'unit-1',
      buildingId: 'building-1',
      buildingName: 'Building 1',
      unitLabel: '101',
    });
    messagingRepo.getManagementUserIdsForBuilding.mockResolvedValue([
      'manager-1',
      'manager-2',
    ]);
    messagingRepo.createConversation.mockResolvedValue({
      id: 'conversation-1',
      org: { id: 'org-1', name: 'Org 1' },
      building: { id: 'building-1', name: 'Building 1' },
      subject: 'Estimate',
      messages: [
        {
          id: 'message-1',
          content: 'Please review the estimate.',
          senderUser: { id: 'owner-user-1', name: 'Owner' },
        },
      ],
    });

    await service.createOwnerConversationWithManagement(
      { sub: 'owner-user-1', email: 'owner@example.com', orgId: null },
      {
        unitId: 'unit-1',
        subject: 'Estimate',
        message: 'Please review the estimate.',
      },
    );

    expect(
      ownerPortfolioScopeService.getAccessibleUnitOrThrow,
    ).toHaveBeenCalledWith('owner-user-1', 'unit-1');
    expect(
      ownerPortfolioScopeService.listAccessibleUnits,
    ).not.toHaveBeenCalled();
    expect(messagingRepo.getManagementUserIdsForBuilding).toHaveBeenCalledWith(
      'building-1',
      'org-1',
    );
    expect(messagingRepo.createConversation).toHaveBeenCalledWith({
      orgId: 'org-1',
      type: ConversationType.MANAGEMENT_OWNER,
      counterpartyGroup: ConversationCounterpartyGroup.OWNER,
      buildingId: 'building-1',
      subject: 'Estimate',
      participantUserIds: ['owner-user-1', 'manager-1', 'manager-2'],
      initialMessage: {
        senderUserId: 'owner-user-1',
        content: 'Please review the estimate.',
      },
    });
  });

  it('creates resident-to-owner conversations from the resident occupancy scope', async () => {
    messagingRepo.findActiveOccupancyByResident.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    messagingRepo.getActiveOwnerUserIdsForUnit.mockResolvedValue([
      'owner-user-1',
    ]);
    messagingRepo.createConversation.mockResolvedValue({
      id: 'conversation-1',
      org: { id: 'org-1', name: 'Org 1' },
      building: { id: 'building-1', name: 'Building 1' },
      subject: 'Lease renewal',
      messages: [
        {
          id: 'message-1',
          content: 'Please confirm next steps.',
          senderUser: { id: 'resident-1', name: 'Resident' },
        },
      ],
    });

    await service.createResidentConversationWithOwner(
      { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
      'org-1',
      {
        subject: 'Lease renewal',
        message: 'Please confirm next steps.',
      },
    );

    expect(messagingRepo.findActiveOccupancyByResident).toHaveBeenCalledWith(
      'resident-1',
      'org-1',
    );
    expect(messagingRepo.getActiveOwnerUserIdsForUnit).toHaveBeenCalledWith(
      'unit-1',
      'org-1',
    );
    expect(messagingRepo.createConversation).toHaveBeenCalledWith({
      orgId: 'org-1',
      type: ConversationType.OWNER_TENANT,
      counterpartyGroup: ConversationCounterpartyGroup.MIXED,
      buildingId: 'building-1',
      subject: 'Lease renewal',
      participantUserIds: ['resident-1', 'owner-user-1'],
      initialMessage: {
        senderUserId: 'resident-1',
        content: 'Please confirm next steps.',
      },
    });
  });

  it('lists resident management contacts for the active occupancy building', async () => {
    messagingRepo.findActiveOccupancyByResident.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    messagingRepo.listManagementUsersForBuilding.mockResolvedValue([
      { id: 'manager-1', name: 'Alice Manager', avatarUrl: null },
      {
        id: 'manager-2',
        name: 'Bob Staff',
        avatarUrl: 'https://example.com/avatar.png',
      },
    ]);

    await expect(
      service.listResidentManagementContacts(
        { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
        'org-1',
      ),
    ).resolves.toEqual([
      { id: 'manager-1', name: 'Alice Manager', avatarUrl: null },
      {
        id: 'manager-2',
        name: 'Bob Staff',
        avatarUrl: 'https://example.com/avatar.png',
      },
    ]);

    expect(messagingRepo.listManagementUsersForBuilding).toHaveBeenCalledWith(
      'building-1',
      'org-1',
    );
  });

  it('creates a resident-to-management conversation with a selected management contact', async () => {
    messagingRepo.findActiveOccupancyByResident.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    messagingRepo.listManagementUsersForBuilding.mockResolvedValue([
      { id: 'manager-1', name: 'Alice Manager', avatarUrl: null },
      { id: 'manager-2', name: 'Bob Staff', avatarUrl: null },
    ]);
    messagingRepo.createConversation.mockResolvedValue({
      id: 'conversation-1',
      org: { id: 'org-1', name: 'Org 1' },
      building: { id: 'building-1', name: 'Building 1' },
      subject: 'Targeted chat',
      messages: [
        {
          id: 'message-1',
          content: 'Please review this issue.',
          senderUser: { id: 'resident-1', name: 'Resident' },
        },
      ],
    });

    await service.createResidentConversationWithManagement(
      { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
      'org-1',
      {
        managementUserId: 'manager-2',
        subject: 'Targeted chat',
        message: 'Please review this issue.',
      },
    );

    expect(messagingRepo.createConversation).toHaveBeenCalledWith({
      orgId: 'org-1',
      type: ConversationType.MANAGEMENT_TENANT,
      counterpartyGroup: ConversationCounterpartyGroup.TENANT,
      buildingId: 'building-1',
      subject: 'Targeted chat',
      participantUserIds: ['resident-1', 'manager-2'],
      initialMessage: {
        senderUserId: 'resident-1',
        content: 'Please review this issue.',
      },
    });
  });

  it('rejects resident-to-management conversation creation when the selected contact is not eligible', async () => {
    messagingRepo.findActiveOccupancyByResident.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    messagingRepo.listManagementUsersForBuilding.mockResolvedValue([
      { id: 'manager-1', name: 'Alice Manager', avatarUrl: null },
    ]);

    await expect(
      service.createResidentConversationWithManagement(
        { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
        'org-1',
        {
          managementUserId: 'manager-9',
          message: 'Hello',
        },
      ),
    ).rejects.toThrow(
      'Selected management user is not assigned to this building',
    );
  });

  it('blocks resident-to-owner conversations when the unit has no active owner user', async () => {
    messagingRepo.findActiveOccupancyByResident.mockResolvedValue({
      id: 'occupancy-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
    });
    messagingRepo.getActiveOwnerUserIdsForUnit.mockResolvedValue([]);

    await expect(
      service.createResidentConversationWithOwner(
        { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
        'org-1',
        {
          message: 'Hello',
        },
      ),
    ).rejects.toThrow('No active owner user is assigned to this unit');
  });

  it('blocks owner-to-tenant conversations when the tenant is not active in the selected unit', async () => {
    ownerPortfolioScopeService.getAccessibleUnitOrThrow.mockResolvedValue({
      orgId: 'org-1',
      orgName: 'Org 1',
      ownerId: 'owner-1',
      unitId: 'unit-1',
      buildingId: 'building-1',
      buildingName: 'Building 1',
      unitLabel: '101',
    });
    messagingRepo.findActiveOccupancyForResidentInUnit.mockResolvedValue(null);

    await expect(
      service.createOwnerConversationWithTenant(
        { sub: 'owner-user-1', email: 'owner@example.com', orgId: null },
        {
          unitId: 'unit-1',
          tenantUserId: 'tenant-1',
          message: 'Hello',
        },
      ),
    ).rejects.toThrow('Tenant is not an active resident of this unit');

    expect(
      ownerPortfolioScopeService.getAccessibleUnitOrThrow,
    ).toHaveBeenCalledWith('owner-user-1', 'unit-1');
    expect(
      ownerPortfolioScopeService.listAccessibleUnits,
    ).not.toHaveBeenCalled();
  });

  it('lists owner conversations across orgs by participant membership', async () => {
    messagingRepo.listConversationsForUserAcrossOrgs.mockResolvedValue([
      {
        id: 'conversation-1',
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ]);

    const result = await service.listOwnerConversations(
      { sub: 'owner-user-1', email: 'owner@example.com', orgId: null },
      {},
    );

    expect(
      messagingRepo.listConversationsForUserAcrossOrgs,
    ).toHaveBeenCalledWith('owner-user-1', {
      counterpartyGroup: undefined,
      type: undefined,
      take: 21,
      cursor: undefined,
    });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeUndefined();
  });

  it('counts unread org-scoped conversation messages for the current participant', async () => {
    messagingRepo.countUnreadMessagesForUser.mockResolvedValue(3);

    await expect(
      service.countUnreadMessages(
        { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' },
        'org-1',
      ),
    ).resolves.toBe(3);

    expect(messagingRepo.countUnreadMessagesForUser).toHaveBeenCalledWith(
      'user-1',
      'org-1',
    );
  });

  it('restores prior resident conversation history once the same user is active again', async () => {
    messagingRepo.listConversationsForUser.mockResolvedValue([
      {
        id: 'conversation-legacy',
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ]);

    const result = await service.listConversations(
      { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
      'org-1',
      {},
    );

    expect(messagingRepo.listConversationsForUser).toHaveBeenCalledWith(
      'resident-1',
      'org-1',
      {
        counterpartyGroup: undefined,
        type: undefined,
        take: 21,
        cursor: undefined,
      },
    );
    expect(result.items).toHaveLength(1);
  });

  it('counts unread owner conversation messages across participant-visible orgs', async () => {
    messagingRepo.countUnreadMessagesForUserAcrossOrgs.mockResolvedValue(5);

    await expect(
      service.countUnreadOwnerMessages({
        sub: 'owner-user-1',
        email: 'owner@example.com',
        orgId: null,
      }),
    ).resolves.toBe(5);

    expect(
      messagingRepo.countUnreadMessagesForUserAcrossOrgs,
    ).toHaveBeenCalledWith('owner-user-1');
  });

  it.each([
    [
      'list conversations',
      () =>
        service.listConversations(
          { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
          'org-1',
          {},
        ),
    ],
    [
      'get a conversation',
      () =>
        service.getConversation(
          { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
          'org-1',
          'conversation-1',
        ),
    ],
    [
      'count unread messages',
      () =>
        service.countUnreadMessages(
          { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
          'org-1',
        ),
    ],
    [
      'send a message',
      () =>
        service.sendMessage(
          { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
          'org-1',
          'conversation-1',
          'Hello again',
        ),
    ],
    [
      'mark a conversation as read',
      () =>
        service.markAsRead(
          { sub: 'resident-1', email: 'resident@example.com', orgId: 'org-1' },
          'org-1',
          'conversation-1',
        ),
    ],
  ])(
    'requires active occupancy to %s for resident self-service messaging',
    async (_label, action: () => Promise<unknown>) => {
      messagingRepo.findActiveOccupancyByResident.mockResolvedValue(null);
      messagingRepo.hasOccupancyHistoryByResident.mockResolvedValue(true);

      await expect(action()).rejects.toThrow('Active occupancy required');
    },
  );

  it('allows org-scoped messaging role assignments to bypass resident occupancy checks', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'ORG',
          roleTemplate: { key: 'org_admin' },
        },
      ],
      rolePermissionKeys: ['messaging.write'],
      userOverrides: [],
    });
    messagingRepo.listConversationsForUser.mockResolvedValue([
      {
        id: 'conversation-1',
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ]);

    const result = await service.listConversations(
      { sub: 'admin-1', email: 'admin@example.com', orgId: 'org-1' },
      'org-1',
      {},
    );

    expect(accessControlService.getUserScopedAssignments).toHaveBeenCalledWith(
      'admin-1',
      { orgId: 'org-1' },
    );
    expect(messagingRepo.findActiveOccupancyByResident).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
  });

  it('allows building-scoped messaging handlers to reply without resident occupancy', async () => {
    messagingRepo.getUserBuildingIdsWithPermission.mockResolvedValue([
      'building-1',
    ]);
    messagingRepo.isUserParticipant.mockResolvedValue(true);
    messagingRepo.addMessage.mockResolvedValue({
      id: 'message-1',
      content: 'On my way',
      senderUser: { id: 'staff-1', name: 'Staff User' },
    });
    messagingRepo.getConversationParticipantUserIds.mockResolvedValue([
      'staff-1',
      'resident-1',
    ]);

    await service.sendMessage(
      { sub: 'staff-1', email: 'staff@example.com', orgId: 'org-1' },
      'org-1',
      'conversation-1',
      'On my way',
    );

    expect(messagingRepo.findActiveOccupancyByResident).not.toHaveBeenCalled();
    expect(messagingRepo.isUserParticipant).toHaveBeenCalledWith(
      'conversation-1',
      'staff-1',
    );
  });

  it('passes a requested conversation type filter to org-scoped conversation listing', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'ORG',
          roleTemplate: { key: 'org_admin' },
        },
      ],
      rolePermissionKeys: ['messaging.write'],
      userOverrides: [],
    });
    messagingRepo.listConversationsForUser.mockResolvedValue([
      {
        id: 'conversation-filtered',
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ]);

    await service.listConversations(
      { sub: 'admin-1', email: 'admin@example.com', orgId: 'org-1' },
      'org-1',
      { type: ConversationType.MANAGEMENT_TENANT },
    );

    expect(messagingRepo.listConversationsForUser).toHaveBeenCalledWith(
      'admin-1',
      'org-1',
      {
        counterpartyGroup: undefined,
        type: ConversationType.MANAGEMENT_TENANT,
        take: 21,
        cursor: undefined,
      },
    );
  });

  it('passes a requested counterparty group filter to org-scoped conversation listing', async () => {
    accessControlService.getUserScopedAssignments.mockResolvedValue({
      assignments: [
        {
          scopeType: 'ORG',
          roleTemplate: { key: 'org_admin' },
        },
      ],
      rolePermissionKeys: ['messaging.write'],
      userOverrides: [],
    });
    messagingRepo.listConversationsForUser.mockResolvedValue([
      {
        id: 'conversation-group-filtered',
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ]);

    await service.listConversations(
      { sub: 'admin-1', email: 'admin@example.com', orgId: 'org-1' },
      'org-1',
      { counterpartyGroup: ConversationCounterpartyGroup.TENANT },
    );

    expect(messagingRepo.listConversationsForUser).toHaveBeenCalledWith(
      'admin-1',
      'org-1',
      {
        counterpartyGroup: ConversationCounterpartyGroup.TENANT,
        type: undefined,
        take: 21,
        cursor: undefined,
      },
    );
  });
});

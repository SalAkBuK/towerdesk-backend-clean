import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const notificationsRepo = {
    listForUserAcrossOrgs: jest.fn(),
    findByIdForUserAcrossOrgs: jest.fn(),
    countUnreadAcrossOrgs: jest.fn(),
    countUnread: jest.fn(),
    markAllReadAcrossOrgs: jest.fn(),
    findByIdForUser: jest.fn(),
    markRead: jest.fn(),
    markDismissed: jest.fn(),
    clearDismissed: jest.fn(),
  };
  const realtimeService = {
    publishToUser: jest.fn(),
  };
  const pushNotificationsService = {
    sendToUsers: jest.fn(),
  };

  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(
      notificationsRepo as never,
      realtimeService as never,
      pushNotificationsService as never,
    );
  });

  it('lists owner notifications across orgs with cursor pagination', async () => {
    const items = [
      {
        id: 'n3',
        orgId: 'org-2',
        createdAt: new Date('2026-04-05T02:00:00.000Z'),
      },
      {
        id: 'n2',
        orgId: 'org-1',
        createdAt: new Date('2026-04-05T01:00:00.000Z'),
      },
      {
        id: 'n1',
        orgId: 'org-1',
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ];
    notificationsRepo.listForUserAcrossOrgs.mockResolvedValue({ items });

    const result = await service.listForUserAcrossOrgs(
      'owner-user-1',
      ['org-1', 'org-2'],
      { limit: 2 },
    );

    expect(notificationsRepo.listForUserAcrossOrgs).toHaveBeenCalledWith(
      'owner-user-1',
      ['org-1', 'org-2'],
      expect.objectContaining({
        take: 3,
      }),
    );
    expect(result.items).toEqual(items.slice(0, 2));
    expect(result.nextCursor).toBeTruthy();
  });

  it('marks a notification read after resolving it across org scope', async () => {
    notificationsRepo.findByIdForUserAcrossOrgs.mockResolvedValue({
      id: 'notification-1',
      orgId: 'org-2',
      recipientUserId: 'owner-user-1',
      readAt: null,
      dismissedAt: null,
    });
    notificationsRepo.findByIdForUser.mockResolvedValue({
      id: 'notification-1',
      orgId: 'org-2',
      recipientUserId: 'owner-user-1',
      readAt: null,
      dismissedAt: null,
    });
    notificationsRepo.markRead.mockResolvedValue(1);

    await service.markReadAcrossOrgs('notification-1', 'owner-user-1', [
      'org-1',
      'org-2',
    ]);

    expect(notificationsRepo.findByIdForUserAcrossOrgs).toHaveBeenCalledWith(
      'notification-1',
      'owner-user-1',
      ['org-1', 'org-2'],
    );
    expect(notificationsRepo.markRead).toHaveBeenCalledWith(
      'notification-1',
      'owner-user-1',
      'org-2',
      expect.any(Date),
    );
  });

  it('marks all notifications read across every accessible owner org', async () => {
    notificationsRepo.markAllReadAcrossOrgs.mockResolvedValue(2);

    await service.markAllReadAcrossOrgs('owner-user-1', ['org-1', 'org-2']);

    expect(notificationsRepo.markAllReadAcrossOrgs).toHaveBeenCalledWith(
      'owner-user-1',
      ['org-1', 'org-2'],
      expect.any(Date),
    );
    expect(realtimeService.publishToUser).toHaveBeenCalledTimes(2);
  });

  it('counts unread owner notifications across every accessible org', async () => {
    notificationsRepo.countUnreadAcrossOrgs.mockResolvedValue(4);

    await expect(
      service.countUnreadAcrossOrgs('owner-user-1', ['org-1', 'org-2']),
    ).resolves.toBe(4);

    expect(notificationsRepo.countUnreadAcrossOrgs).toHaveBeenCalledWith(
      'owner-user-1',
      ['org-1', 'org-2'],
    );
  });
});

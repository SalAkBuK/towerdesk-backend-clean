import { DeliveryTaskKind, NotificationType } from '@prisma/client';
import { DeliveryTasksRepo } from '../../infra/queue/delivery-tasks.repo';
import { BroadcastDeliveryService } from './broadcast-delivery.service';

describe('BroadcastDeliveryService', () => {
  let prisma: { $transaction: jest.Mock };
  let deliveryTasksRepo: DeliveryTasksRepo;
  let queueService: { enqueue: jest.Mock };
  let notificationsRepo: { createManyAndReturn: jest.Mock };
  let notificationsService: {
    publishCreatedNotifications: jest.Mock;
    queuePushForNotificationBatch: jest.Mock;
  };
  let service: BroadcastDeliveryService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
      ),
    };
    deliveryTasksRepo = new DeliveryTasksRepo({} as never);
    queueService = {
      enqueue: jest.fn().mockResolvedValue(true),
    };
    notificationsRepo = {
      createManyAndReturn: jest.fn(),
    };
    notificationsService = {
      publishCreatedNotifications: jest.fn(),
      queuePushForNotificationBatch: jest.fn(),
    };

    service = new BroadcastDeliveryService(
      prisma as never,
      deliveryTasksRepo,
      queueService as never,
      notificationsRepo as never,
      notificationsService as never,
    );
  });

  it('keeps a broadcast task succeeded when downstream push queueing fails after commit', async () => {
    const task = await deliveryTasksRepo.create({
      kind: DeliveryTaskKind.BROADCAST_FANOUT,
      queueName: 'broadcast-deliveries',
      jobName: 'broadcasts.fanout',
      orgId: 'org-1',
      userId: 'sender-1',
      referenceType: 'BROADCAST',
      referenceId: 'broadcast-1',
      payload: {
        broadcastId: 'broadcast-1',
        orgId: 'org-1',
        userIds: ['user-1'],
        title: 'Notice',
        body: 'Hello',
        senderUserId: 'sender-1',
        buildingIds: ['building-1'],
        metadata: { audience: 'tenants' },
      },
    });
    const createdNotifications = [
      {
        id: 'notification-1',
        orgId: 'org-1',
        recipientUserId: 'user-1',
        type: NotificationType.BROADCAST,
        title: 'Notice',
        body: 'Hello',
        data: {},
        createdAt: new Date(),
      },
    ];

    notificationsRepo.createManyAndReturn.mockResolvedValue(
      createdNotifications,
    );
    notificationsService.queuePushForNotificationBatch.mockRejectedValue(
      new Error('push queue offline'),
    );

    await service.processTask(task.id);

    const updated = await deliveryTasksRepo.findById(task.id);
    expect(updated?.status).toBe('SUCCEEDED');
    expect(updated?.lastError).toBeNull();
    expect(notificationsRepo.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(
      notificationsService.publishCreatedNotifications,
    ).toHaveBeenCalledWith('org-1', createdNotifications);
    expect(
      notificationsService.queuePushForNotificationBatch,
    ).toHaveBeenCalledTimes(1);
  });
});

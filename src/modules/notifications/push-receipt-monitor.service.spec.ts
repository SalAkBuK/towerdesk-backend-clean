import { PushPlatform, PushProvider } from '@prisma/client';
import { env } from '../../config/env';
import { PushDevicesRepo } from './push-devices.repo';
import { PushDeliveryReceiptsRepo } from './push-delivery-receipts.repo';
import { PushReceiptMonitorService } from './push-receipt-monitor.service';

describe('PushReceiptMonitorService', () => {
  let pushDeliveryReceiptsRepo: jest.Mocked<PushDeliveryReceiptsRepo>;
  let pushDevicesRepo: jest.Mocked<PushDevicesRepo>;
  let service: PushReceiptMonitorService;
  let originalFetch: typeof fetch;
  let originalRuntime: typeof env.APP_RUNTIME;
  let originalProvider: typeof env.PUSH_PROVIDER;
  let originalReceiptsEnabled: typeof env.PUSH_RECEIPTS_ENABLED;

  beforeAll(() => {
    originalFetch = global.fetch;
    originalRuntime = env.APP_RUNTIME;
    originalProvider = env.PUSH_PROVIDER;
    originalReceiptsEnabled = env.PUSH_RECEIPTS_ENABLED;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    env.APP_RUNTIME = originalRuntime;
    env.PUSH_PROVIDER = originalProvider;
    env.PUSH_RECEIPTS_ENABLED = originalReceiptsEnabled;
  });

  beforeEach(() => {
    env.APP_RUNTIME = 'worker';
    env.PUSH_PROVIDER = 'expo';
    env.PUSH_RECEIPTS_ENABLED = true;

    pushDeliveryReceiptsRepo = {
      listPendingExpoReceipts: jest.fn(),
      markLookupAttempted: jest.fn(),
      markDelivered: jest.fn(),
      markErrored: jest.fn(),
    } as never;
    pushDevicesRepo = {
      deactivateByIds: jest.fn(),
    } as never;

    service = new PushReceiptMonitorService(
      pushDeliveryReceiptsRepo,
      pushDevicesRepo,
    );
  });

  it('marks delivered and errored Expo receipts and deactivates unregistered devices', async () => {
    pushDeliveryReceiptsRepo.listPendingExpoReceipts.mockResolvedValue([
      {
        id: 'receipt-1',
        taskId: 'task-1',
        provider: PushProvider.EXPO,
        platform: PushPlatform.IOS,
        userId: 'user-1',
        pushDeviceId: 'device-1',
        deviceTokenMasked: 'ExpoPu...1234',
        providerTicketId: 'ticket-1',
        providerReceiptId: null,
        status: 'PENDING',
        errorCode: null,
        errorMessage: null,
        details: null,
        checkedAt: null,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        updatedAt: new Date(),
      },
      {
        id: 'receipt-2',
        taskId: 'task-1',
        provider: PushProvider.EXPO,
        platform: PushPlatform.ANDROID,
        userId: 'user-2',
        pushDeviceId: 'device-2',
        deviceTokenMasked: 'ExpoPu...5678',
        providerTicketId: 'ticket-2',
        providerReceiptId: null,
        status: 'PENDING',
        errorCode: null,
        errorMessage: null,
        details: null,
        checkedAt: null,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        updatedAt: new Date(),
      },
    ] as never);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          'ticket-1': { status: 'ok' },
          'ticket-2': {
            status: 'error',
            message: 'Device not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      }),
    }) as never;
    pushDeliveryReceiptsRepo.markErrored.mockResolvedValue({
      pushDeviceId: 'device-2',
    } as never);

    const processed = await service.pollPendingReceipts(new Date());

    expect(processed).toBe(2);
    expect(pushDeliveryReceiptsRepo.markLookupAttempted).toHaveBeenCalledWith(
      ['ticket-1', 'ticket-2'],
      expect.any(Date),
    );
    expect(pushDeliveryReceiptsRepo.markDelivered).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({
        providerReceiptId: 'ticket-1',
      }),
    );
    expect(pushDeliveryReceiptsRepo.markErrored).toHaveBeenCalledWith(
      'ticket-2',
      expect.objectContaining({
        errorCode: 'DeviceNotRegistered',
        errorMessage: 'Device not registered',
      }),
    );
    expect(pushDevicesRepo.deactivateByIds).toHaveBeenCalledWith(['device-2']);
  });
});

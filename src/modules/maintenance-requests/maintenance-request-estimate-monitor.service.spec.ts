import { EventEmitter2 } from '@nestjs/event-emitter';
import { MaintenanceRequestEstimateMonitorService } from './maintenance-request-estimate-monitor.service';
import { MAINTENANCE_REQUEST_EVENTS } from './maintenance-requests.events';
import { MaintenanceRequestsRepo } from './maintenance-requests.repo';

describe('MaintenanceRequestEstimateMonitorService', () => {
  let requestsRepo: jest.Mocked<MaintenanceRequestsRepo>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let service: MaintenanceRequestEstimateMonitorService;

  beforeEach(() => {
    requestsRepo = {
      listPendingEstimateReminderRequests: jest.fn(),
      markEstimateReminderSentIfPending: jest.fn(),
    } as unknown as jest.Mocked<MaintenanceRequestsRepo>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new MaintenanceRequestEstimateMonitorService(
      requestsRepo,
      eventEmitter,
    );
  });

  it('marks stale estimate requests and emits reminder events once', async () => {
    const now = new Date('2026-04-08T12:00:00.000Z');
    requestsRepo.listPendingEstimateReminderRequests.mockResolvedValue([
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        unitId: 'unit-1',
        title: 'AC not cooling',
        status: 'OPEN',
        ownerApprovalStatus: 'NOT_REQUIRED',
        createdByUserId: 'resident-1',
        serviceProviderId: 'provider-1',
        unit: { id: 'unit-1', label: 'A-101' },
      },
    ] as never);
    requestsRepo.markEstimateReminderSentIfPending.mockResolvedValue({
      count: 1,
    } as never);

    const emitted = await service.scanAndEmitReminders(now);

    expect(emitted).toBe(1);
    expect(requestsRepo.markEstimateReminderSentIfPending).toHaveBeenCalledWith(
      'request-1',
      now,
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MAINTENANCE_REQUEST_EVENTS.ESTIMATE_REMINDER,
      {
        actorUserId: 'system',
        request: {
          id: 'request-1',
          orgId: 'org-1',
          buildingId: 'building-1',
          unitId: 'unit-1',
          title: 'AC not cooling',
          status: 'OPEN',
          ownerApprovalStatus: 'NOT_REQUIRED',
          createdByUserId: 'resident-1',
          assignedToUserId: null,
          serviceProviderId: 'provider-1',
          serviceProviderAssignedUserId: null,
          isEmergency: false,
          emergencySignals: [],
          unit: { id: 'unit-1', label: 'A-101' },
        },
      },
    );
  });

  it('skips events when another worker already marked the reminder', async () => {
    const now = new Date('2026-04-08T12:00:00.000Z');
    requestsRepo.listPendingEstimateReminderRequests.mockResolvedValue([
      {
        id: 'request-1',
        orgId: 'org-1',
        buildingId: 'building-1',
        createdByUserId: 'resident-1',
        title: 'AC not cooling',
      },
    ] as never);
    requestsRepo.markEstimateReminderSentIfPending.mockResolvedValue({
      count: 0,
    } as never);

    const emitted = await service.scanAndEmitReminders(now);

    expect(emitted).toBe(0);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});

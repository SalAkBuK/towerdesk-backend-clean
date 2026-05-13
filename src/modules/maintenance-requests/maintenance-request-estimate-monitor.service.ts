import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { env } from '../../config/env';
import {
  MAINTENANCE_REQUEST_EVENTS,
  MaintenanceRequestSnapshot,
} from './maintenance-requests.events';
import { MaintenanceRequestsRepo } from './maintenance-requests.repo';

const SYSTEM_ACTOR_USER_ID = 'system';

@Injectable()
export class MaintenanceRequestEstimateMonitorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    MaintenanceRequestEstimateMonitorService.name,
  );
  private readonly enabled = env.MAINTENANCE_ESTIMATE_REMINDER_ENABLED;
  private readonly intervalMs = env.MAINTENANCE_ESTIMATE_REMINDER_INTERVAL_MS;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly requestsRepo: MaintenanceRequestsRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    if (!this.enabled) {
      return;
    }
    this.timer = setInterval(() => {
      void this.scanAndEmitReminders().catch((error: unknown) => {
        this.logger.error(error, 'failed to scan stale estimate requests');
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async scanAndEmitReminders(now = new Date()) {
    const staleRequests =
      await this.requestsRepo.listPendingEstimateReminderRequests(now);
    let emitted = 0;

    for (const request of staleRequests) {
      const result = await this.requestsRepo.markEstimateReminderSentIfPending(
        request.id,
        now,
      );
      if (result.count === 0) {
        continue;
      }

      emitted += 1;
      this.eventEmitter.emit(MAINTENANCE_REQUEST_EVENTS.ESTIMATE_REMINDER, {
        request: this.toEventRequest(request),
        actorUserId: SYSTEM_ACTOR_USER_ID,
      });
    }

    return emitted;
  }

  private toEventRequest(request: {
    id: string;
    orgId: string;
    buildingId: string;
    unitId?: string | null;
    title: string;
    status?: string | null;
    ownerApprovalStatus?: string | null;
    createdByUserId: string;
    assignedToUserId?: string | null;
    serviceProviderId?: string | null;
    serviceProviderAssignedUserId?: string | null;
    isEmergency?: boolean | null;
    emergencySignals?: string[] | null;
    unit?: { id: string; label: string } | null;
  }): MaintenanceRequestSnapshot {
    return {
      id: request.id,
      orgId: request.orgId,
      buildingId: request.buildingId,
      unitId: request.unitId ?? null,
      title: request.title,
      status: request.status ?? null,
      ownerApprovalStatus: request.ownerApprovalStatus ?? null,
      createdByUserId: request.createdByUserId,
      assignedToUserId: request.assignedToUserId ?? null,
      serviceProviderId: request.serviceProviderId ?? null,
      serviceProviderAssignedUserId:
        request.serviceProviderAssignedUserId ?? null,
      isEmergency: request.isEmergency ?? false,
      emergencySignals: request.emergencySignals ?? [],
      unit: request.unit
        ? { id: request.unit.id, label: request.unit.label }
        : null,
    };
  }
}

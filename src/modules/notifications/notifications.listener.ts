import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  MaintenanceRequestEventPayload,
  MAINTENANCE_REQUEST_EVENTS,
  MaintenanceRequestSnapshot,
} from '../maintenance-requests/maintenance-requests.events';
import { NotificationTypeEnum } from './notifications.constants';
import { NotificationsService } from './notifications.service';
import { NotificationRecipientResolver } from './notification-recipient.resolver';

@Injectable()
export class NotificationsListener {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly recipientResolver: NotificationRecipientResolver,
  ) {}

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.CREATED)
  async handleRequestCreated(payload: MaintenanceRequestEventPayload) {
    const recipients = await this.recipientResolver.resolveForRequestCreated(
      payload.request,
      payload.actorUserId,
    );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.REQUEST_CREATED,
      title: 'New maintenance request',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.ASSIGNED)
  async handleRequestAssigned(payload: MaintenanceRequestEventPayload) {
    const recipients = await this.recipientResolver.resolveForRequestAssigned(
      payload.request,
      payload.actorUserId,
      payload.previousRequest,
    );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.REQUEST_ASSIGNED,
      title: 'Request assigned',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.STATUS_CHANGED)
  async handleRequestStatusChanged(payload: MaintenanceRequestEventPayload) {
    const recipients =
      await this.recipientResolver.resolveForRequestStatusChanged(
        payload.request,
        payload.actorUserId,
        payload.previousRequest,
      );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.REQUEST_STATUS_CHANGED,
      title: 'Request status updated',
      body: payload.request.status ?? undefined,
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.COMMENTED)
  async handleRequestCommented(payload: MaintenanceRequestEventPayload) {
    const recipients = await this.recipientResolver.resolveForRequestCommented(
      payload.request,
      payload.actorUserId,
      payload.actorIsResident ?? false,
    );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.REQUEST_COMMENTED,
      title: 'New comment',
      body: payload.comment
        ? this.truncateMessage(payload.comment.message)
        : undefined,
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.CANCELED)
  async handleRequestCanceled(payload: MaintenanceRequestEventPayload) {
    const recipients = await this.recipientResolver.resolveForRequestCanceled(
      payload.request,
      payload.actorUserId,
    );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.REQUEST_CANCELED,
      title: 'Request canceled',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.ESTIMATE_REMINDER)
  async handleEstimateReminder(payload: MaintenanceRequestEventPayload) {
    const recipients = await this.recipientResolver.resolveForEstimateReminder(
      payload.request,
      payload.actorUserId,
    );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.ESTIMATE_REMINDER,
      title: 'Estimate overdue',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REQUESTED)
  async handleOwnerApprovalRequested(payload: MaintenanceRequestEventPayload) {
    const recipients =
      await this.recipientResolver.resolveForOwnerApprovalRequested(
        payload.request,
        payload.actorUserId,
      );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.OWNER_APPROVAL_REQUESTED,
      title: 'Owner approval requested',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REMINDER)
  async handleOwnerApprovalReminder(payload: MaintenanceRequestEventPayload) {
    const recipients =
      await this.recipientResolver.resolveForOwnerApprovalReminder(
        payload.request,
        payload.actorUserId,
      );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.OWNER_APPROVAL_REMINDER,
      title: 'Owner approval reminder',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_REQUEST_APPROVED)
  async handleOwnerRequestApproved(payload: MaintenanceRequestEventPayload) {
    const recipients =
      await this.recipientResolver.resolveForOwnerRequestApproved(
        payload.request,
        payload.actorUserId,
      );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.OWNER_REQUEST_APPROVED,
      title: 'Request approved',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_REQUEST_REJECTED)
  async handleOwnerRequestRejected(payload: MaintenanceRequestEventPayload) {
    const recipients =
      await this.recipientResolver.resolveForOwnerRequestRejected(
        payload.request,
        payload.actorUserId,
      );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.OWNER_REQUEST_REJECTED,
      title: 'Request rejected',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  @OnEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_REQUEST_OVERRIDDEN)
  async handleOwnerRequestOverridden(payload: MaintenanceRequestEventPayload) {
    const recipients =
      await this.recipientResolver.resolveForOwnerRequestOverridden(
        payload.request,
        payload.actorUserId,
      );

    await this.notificationsService.createForUsers({
      orgId: payload.request.orgId,
      userIds: Array.from(recipients),
      type: NotificationTypeEnum.OWNER_REQUEST_OVERRIDDEN,
      title: 'Request overridden',
      body: this.buildRequestBody(payload.request),
      data: this.buildNotificationData(payload),
    });
  }

  private buildRequestBody(request: MaintenanceRequestSnapshot) {
    const label = request.unit?.label;
    if (!label) {
      return request.title;
    }
    return `Unit ${label}: ${request.title}`;
  }

  private buildNotificationData(payload: MaintenanceRequestEventPayload) {
    const request = payload.request;
    const unitId = request.unit?.id ?? request.unitId ?? null;
    return {
      requestId: request.id,
      buildingId: request.buildingId,
      unitId,
      actorUserId: payload.actorUserId,
      status: request.status ?? undefined,
      ownerApprovalStatus: request.ownerApprovalStatus ?? undefined,
      isEmergency: request.isEmergency ?? false,
      commentId: payload.comment?.id,
    };
  }

  private truncateMessage(message: string) {
    const trimmed = message.trim();
    if (trimmed.length <= 80) {
      return trimmed;
    }
    return `${trimmed.slice(0, 77)}...`;
  }
}

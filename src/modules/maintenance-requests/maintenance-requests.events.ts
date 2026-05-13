export const MAINTENANCE_REQUEST_EVENTS = {
  CREATED: 'maintenance.request.created',
  ASSIGNED: 'maintenance.request.assigned',
  STATUS_CHANGED: 'maintenance.request.status_changed',
  COMMENTED: 'maintenance.request.commented',
  CANCELED: 'maintenance.request.canceled',
  ESTIMATE_REMINDER: 'maintenance.request.estimate_reminder',
  OWNER_APPROVAL_REQUESTED: 'maintenance.request.owner_approval_requested',
  OWNER_APPROVAL_REMINDER: 'maintenance.request.owner_approval_reminder',
  OWNER_REQUEST_APPROVED: 'maintenance.request.owner_request_approved',
  OWNER_REQUEST_REJECTED: 'maintenance.request.owner_request_rejected',
  OWNER_REQUEST_OVERRIDDEN: 'maintenance.request.owner_request_overridden',
} as const;

export type MaintenanceRequestSnapshot = {
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
};

export type MaintenanceRequestCommentSnapshot = {
  id: string;
  message: string;
};

export type MaintenanceRequestEventPayload = {
  request: MaintenanceRequestSnapshot;
  previousRequest?: MaintenanceRequestSnapshot;
  actorUserId: string;
  actorIsResident?: boolean;
  comment?: MaintenanceRequestCommentSnapshot;
};

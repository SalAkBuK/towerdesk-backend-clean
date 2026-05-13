export enum MaintenanceRequestStatusEnum {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
}

export enum MaintenanceRequestOwnerApprovalStatusEnum {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum MaintenanceRequestEstimateStatusEnum {
  NOT_REQUESTED = 'NOT_REQUESTED',
  REQUESTED = 'REQUESTED',
  SUBMITTED = 'SUBMITTED',
}

export enum MaintenanceRequestOwnerApprovalDecisionSourceEnum {
  OWNER = 'OWNER',
  MANAGEMENT_OVERRIDE = 'MANAGEMENT_OVERRIDE',
  EMERGENCY_OVERRIDE = 'EMERGENCY_OVERRIDE',
}

export enum MaintenanceRequestEmergencySignalEnum {
  ACTIVE_LEAK = 'ACTIVE_LEAK',
  NO_POWER = 'NO_POWER',
  SAFETY_RISK = 'SAFETY_RISK',
  NO_COOLING = 'NO_COOLING',
}

export enum MaintenanceRequestPolicyRecommendationEnum {
  PROCEED_NOW = 'PROCEED_NOW',
  GET_ESTIMATE = 'GET_ESTIMATE',
  REQUEST_OWNER_APPROVAL = 'REQUEST_OWNER_APPROVAL',
  PROCEED_AND_NOTIFY = 'PROCEED_AND_NOTIFY',
}

export enum MaintenanceRequestPolicyRouteEnum {
  DIRECT_ASSIGN = 'DIRECT_ASSIGN',
  EMERGENCY_DISPATCH = 'EMERGENCY_DISPATCH',
  NEEDS_ESTIMATE = 'NEEDS_ESTIMATE',
  OWNER_APPROVAL_REQUIRED = 'OWNER_APPROVAL_REQUIRED',
}

export enum MaintenanceRequestQueueEnum {
  NEW = 'NEW',
  NEEDS_ESTIMATE = 'NEEDS_ESTIMATE',
  AWAITING_ESTIMATE = 'AWAITING_ESTIMATE',
  AWAITING_OWNER = 'AWAITING_OWNER',
  READY_TO_ASSIGN = 'READY_TO_ASSIGN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  OVERDUE = 'OVERDUE',
}

export enum MaintenanceRequestOwnerApprovalAuditActionEnum {
  REQUIRED = 'REQUIRED',
  REQUESTED = 'REQUESTED',
  RESENT = 'RESENT',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  OVERRIDDEN = 'OVERRIDDEN',
}

export enum MaintenanceRequestCommentAuthorTypeEnum {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
  STAFF = 'STAFF',
  SYSTEM = 'SYSTEM',
}

export enum MaintenanceRequestCommentVisibilityEnum {
  SHARED = 'SHARED',
  INTERNAL = 'INTERNAL',
}

export const MAINTENANCE_STATUS_TRANSITIONS: Record<
  MaintenanceRequestStatusEnum,
  MaintenanceRequestStatusEnum[]
> = {
  [MaintenanceRequestStatusEnum.OPEN]: [MaintenanceRequestStatusEnum.ASSIGNED],
  [MaintenanceRequestStatusEnum.ASSIGNED]: [
    MaintenanceRequestStatusEnum.IN_PROGRESS,
  ],
  [MaintenanceRequestStatusEnum.IN_PROGRESS]: [
    MaintenanceRequestStatusEnum.COMPLETED,
  ],
  [MaintenanceRequestStatusEnum.COMPLETED]: [],
  [MaintenanceRequestStatusEnum.CANCELED]: [],
};

export const OWNER_APPROVAL_BLOCKING_STATUSES =
  new Set<MaintenanceRequestOwnerApprovalStatusEnum>([
    MaintenanceRequestOwnerApprovalStatusEnum.PENDING,
    MaintenanceRequestOwnerApprovalStatusEnum.REJECTED,
  ]);

export const MAINTENANCE_REQUEST_OVERDUE_HOURS = 72;

import {
  MAINTENANCE_REQUEST_OVERDUE_HOURS,
  MaintenanceRequestEstimateStatusEnum,
  MaintenanceRequestOwnerApprovalStatusEnum,
  MaintenanceRequestPolicyRecommendationEnum,
  MaintenanceRequestPolicyRouteEnum,
  MaintenanceRequestQueueEnum,
  MaintenanceRequestStatusEnum,
} from './maintenance-requests.constants';

type AmountLike = { toString(): string } | string | number | null | undefined;

export type MaintenanceRequestPolicyInput = {
  status?: string | null;
  ownerApprovalStatus?: string | null;
  estimateStatus?: string | null;
  estimatedAmount?: AmountLike;
  isEmergency?: boolean | null;
  emergencySignals?: string[] | null;
  isLikeForLike?: boolean | null;
  isUpgrade?: boolean | null;
  isMajorReplacement?: boolean | null;
  isResponsibilityDisputed?: boolean | null;
  createdAt?: Date | null;
  title?: string | null;
  description?: string | null;
  type?: string | null;
  priority?: string | null;
};

const EMERGENCY_KEYWORDS = [
  'water leak',
  'leak causing damage',
  'flood',
  'flooding',
  'burst pipe',
  'sewage',
  'backup',
  'electrical hazard',
  'sparking',
  'spark',
  'fire',
  'smoke',
  'gas leak',
  'no power',
  'power outage',
  'security risk',
  'unsafe',
];

const DIRECT_ASSIGN_KEYWORDS = [
  'light bulb',
  'bulb out',
  'switch plate',
  'faceplate',
  'door jammed',
  'door handle',
  'lock repair',
  'handle repair',
  'dripping faucet',
  'faucet drip',
  'minor leak',
  'small leak',
  'touch up',
  'touch-up',
];

const toNumber = (amount?: AmountLike) => {
  if (amount === null || amount === undefined) {
    return null;
  }
  const parsed =
    typeof amount === 'number' ? amount : Number.parseFloat(amount.toString());
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (input: MaintenanceRequestPolicyInput) =>
  `${input.title ?? ''} ${input.description ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const hasAnyKeyword = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword));

const inferEmergencyFromIntake = (input: MaintenanceRequestPolicyInput) => {
  const text = normalizeText(input);
  return hasAnyKeyword(text, EMERGENCY_KEYWORDS);
};

const hasEmergencySignals = (input: MaintenanceRequestPolicyInput) =>
  Array.isArray(input.emergencySignals) && input.emergencySignals.length > 0;

const inferDirectAssignFromIntake = (input: MaintenanceRequestPolicyInput) => {
  const type = input.type?.trim().toUpperCase() ?? null;
  const priority = input.priority?.trim().toUpperCase() ?? null;
  const text = normalizeText(input);

  if (hasAnyKeyword(text, DIRECT_ASSIGN_KEYWORDS)) {
    return true;
  }

  if (type === 'CLEANING' && priority !== 'HIGH') {
    return true;
  }

  if (
    type === 'ELECTRICAL' &&
    (text.includes('light') || text.includes('bulb') || text.includes('switch'))
  ) {
    return true;
  }

  if (
    type === 'PLUMBING_AC_HEATING' &&
    (text.includes('faucet') || text.includes('drip'))
  ) {
    return true;
  }

  if (
    type === 'MAINTENANCE' &&
    (text.includes('lock') || text.includes('handle') || text.includes('door'))
  ) {
    return true;
  }

  return false;
};

export const getMaintenanceRequestPolicyRoute = (
  input: MaintenanceRequestPolicyInput,
): MaintenanceRequestPolicyRouteEnum => {
  const ownerApprovalStatus =
    input.ownerApprovalStatus ??
    MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED;
  const estimateStatus =
    input.estimateStatus ?? MaintenanceRequestEstimateStatusEnum.NOT_REQUESTED;
  const estimatedAmount = toNumber(input.estimatedAmount);

  if (estimateStatus === MaintenanceRequestEstimateStatusEnum.REQUESTED) {
    return MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE;
  }

  if (
    ownerApprovalStatus === MaintenanceRequestOwnerApprovalStatusEnum.PENDING ||
    ownerApprovalStatus === MaintenanceRequestOwnerApprovalStatusEnum.REJECTED
  ) {
    return MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED;
  }

  if (
    ownerApprovalStatus === MaintenanceRequestOwnerApprovalStatusEnum.APPROVED
  ) {
    return input.isEmergency ||
      hasEmergencySignals(input) ||
      inferEmergencyFromIntake(input)
      ? MaintenanceRequestPolicyRouteEnum.EMERGENCY_DISPATCH
      : MaintenanceRequestPolicyRouteEnum.DIRECT_ASSIGN;
  }

  if (
    input.isEmergency ||
    hasEmergencySignals(input) ||
    inferEmergencyFromIntake(input)
  ) {
    return MaintenanceRequestPolicyRouteEnum.EMERGENCY_DISPATCH;
  }

  if (
    input.isUpgrade ||
    input.isMajorReplacement ||
    input.isResponsibilityDisputed
  ) {
    return MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED;
  }

  if (input.isLikeForLike === false) {
    return MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED;
  }

  if (estimatedAmount !== null) {
    if (estimatedAmount > 1000) {
      return MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED;
    }

    return MaintenanceRequestPolicyRouteEnum.DIRECT_ASSIGN;
  }

  if (input.isLikeForLike === true || inferDirectAssignFromIntake(input)) {
    return MaintenanceRequestPolicyRouteEnum.DIRECT_ASSIGN;
  }

  return MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE;
};

export const getMaintenanceRequestPolicyRecommendation = (
  input: MaintenanceRequestPolicyInput,
): MaintenanceRequestPolicyRecommendationEnum => {
  switch (getMaintenanceRequestPolicyRoute(input)) {
    case MaintenanceRequestPolicyRouteEnum.DIRECT_ASSIGN:
      return MaintenanceRequestPolicyRecommendationEnum.PROCEED_NOW;
    case MaintenanceRequestPolicyRouteEnum.EMERGENCY_DISPATCH:
      return MaintenanceRequestPolicyRecommendationEnum.PROCEED_AND_NOTIFY;
    case MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED:
      return MaintenanceRequestPolicyRecommendationEnum.REQUEST_OWNER_APPROVAL;
    case MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE:
      return MaintenanceRequestPolicyRecommendationEnum.GET_ESTIMATE;
  }

  return MaintenanceRequestPolicyRecommendationEnum.GET_ESTIMATE;
};

export const getMaintenanceRequestPolicySummary = (
  input: MaintenanceRequestPolicyInput,
) => {
  const estimateStatus =
    input.estimateStatus ?? MaintenanceRequestEstimateStatusEnum.NOT_REQUESTED;

  switch (getMaintenanceRequestPolicyRoute(input)) {
    case MaintenanceRequestPolicyRouteEnum.DIRECT_ASSIGN:
      return 'Ready to assign based on current policy signals.';
    case MaintenanceRequestPolicyRouteEnum.EMERGENCY_DISPATCH:
      return 'Emergency indicators suggest immediate dispatch and owner notification.';
    case MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED:
      return 'Owner approval is required before execution can proceed.';
    case MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE:
      return estimateStatus === MaintenanceRequestEstimateStatusEnum.REQUESTED
        ? 'Estimate has been requested and execution is waiting on provider pricing.'
        : 'Estimate is needed because the current scope or cost is still unclear.';
  }

  return 'Estimate is needed because the current scope or cost is still unclear.';
};

export const isMaintenanceRequestOverdue = (
  input: Pick<MaintenanceRequestPolicyInput, 'createdAt' | 'status'>,
  now = new Date(),
) => {
  if (
    !input.createdAt ||
    ![
      MaintenanceRequestStatusEnum.OPEN,
      MaintenanceRequestStatusEnum.ASSIGNED,
      MaintenanceRequestStatusEnum.IN_PROGRESS,
    ].includes(input.status as MaintenanceRequestStatusEnum)
  ) {
    return false;
  }
  const overdueBefore = new Date(
    now.getTime() - MAINTENANCE_REQUEST_OVERDUE_HOURS * 60 * 60 * 1000,
  );
  return input.createdAt.getTime() <= overdueBefore.getTime();
};

export const matchesMaintenanceRequestQueue = (
  queue: MaintenanceRequestQueueEnum,
  input: MaintenanceRequestPolicyInput,
  now = new Date(),
) => {
  const route = getMaintenanceRequestPolicyRoute(input);
  const ownerApprovalStatus =
    input.ownerApprovalStatus ??
    MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED;
  const estimateStatus =
    input.estimateStatus ?? MaintenanceRequestEstimateStatusEnum.NOT_REQUESTED;

  switch (queue) {
    case MaintenanceRequestQueueEnum.NEW:
      return (
        input.status === MaintenanceRequestStatusEnum.OPEN &&
        ownerApprovalStatus ===
          MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED &&
        route !== MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE &&
        ![
          MaintenanceRequestPolicyRouteEnum.DIRECT_ASSIGN,
          MaintenanceRequestPolicyRouteEnum.EMERGENCY_DISPATCH,
        ].includes(route)
      );
    case MaintenanceRequestQueueEnum.NEEDS_ESTIMATE:
      return (
        ownerApprovalStatus ===
          MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED &&
        route === MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE &&
        estimateStatus !== MaintenanceRequestEstimateStatusEnum.REQUESTED &&
        input.status === MaintenanceRequestStatusEnum.OPEN
      );
    case MaintenanceRequestQueueEnum.AWAITING_ESTIMATE:
      return (
        ownerApprovalStatus ===
          MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED &&
        route === MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE &&
        estimateStatus === MaintenanceRequestEstimateStatusEnum.REQUESTED
      );
    case MaintenanceRequestQueueEnum.AWAITING_OWNER:
      return (
        ownerApprovalStatus ===
        MaintenanceRequestOwnerApprovalStatusEnum.PENDING
      );
    case MaintenanceRequestQueueEnum.READY_TO_ASSIGN:
      return (
        input.status === MaintenanceRequestStatusEnum.OPEN &&
        ownerApprovalStatus !==
          MaintenanceRequestOwnerApprovalStatusEnum.PENDING &&
        ownerApprovalStatus !==
          MaintenanceRequestOwnerApprovalStatusEnum.REJECTED &&
        [
          MaintenanceRequestPolicyRouteEnum.DIRECT_ASSIGN,
          MaintenanceRequestPolicyRouteEnum.EMERGENCY_DISPATCH,
        ].includes(route)
      );
    case MaintenanceRequestQueueEnum.ASSIGNED:
      return input.status === MaintenanceRequestStatusEnum.ASSIGNED;
    case MaintenanceRequestQueueEnum.IN_PROGRESS:
      return input.status === MaintenanceRequestStatusEnum.IN_PROGRESS;
    case MaintenanceRequestQueueEnum.OVERDUE:
      return isMaintenanceRequestOverdue(input, now);
  }
};

export const getPrimaryMaintenanceRequestQueue = (
  input: MaintenanceRequestPolicyInput,
  now = new Date(),
): MaintenanceRequestQueueEnum | null => {
  if (
    matchesMaintenanceRequestQueue(
      MaintenanceRequestQueueEnum.OVERDUE,
      input,
      now,
    )
  ) {
    return MaintenanceRequestQueueEnum.OVERDUE;
  }
  if (
    matchesMaintenanceRequestQueue(
      MaintenanceRequestQueueEnum.AWAITING_OWNER,
      input,
      now,
    )
  ) {
    return MaintenanceRequestQueueEnum.AWAITING_OWNER;
  }
  if (
    matchesMaintenanceRequestQueue(
      MaintenanceRequestQueueEnum.AWAITING_ESTIMATE,
      input,
      now,
    )
  ) {
    return MaintenanceRequestQueueEnum.AWAITING_ESTIMATE;
  }
  if (
    matchesMaintenanceRequestQueue(
      MaintenanceRequestQueueEnum.NEEDS_ESTIMATE,
      input,
      now,
    )
  ) {
    return MaintenanceRequestQueueEnum.NEEDS_ESTIMATE;
  }
  if (
    matchesMaintenanceRequestQueue(
      MaintenanceRequestQueueEnum.IN_PROGRESS,
      input,
      now,
    )
  ) {
    return MaintenanceRequestQueueEnum.IN_PROGRESS;
  }
  if (
    matchesMaintenanceRequestQueue(
      MaintenanceRequestQueueEnum.ASSIGNED,
      input,
      now,
    )
  ) {
    return MaintenanceRequestQueueEnum.ASSIGNED;
  }
  if (
    matchesMaintenanceRequestQueue(
      MaintenanceRequestQueueEnum.READY_TO_ASSIGN,
      input,
      now,
    )
  ) {
    return MaintenanceRequestQueueEnum.READY_TO_ASSIGN;
  }
  if (
    matchesMaintenanceRequestQueue(MaintenanceRequestQueueEnum.NEW, input, now)
  ) {
    return MaintenanceRequestQueueEnum.NEW;
  }
  return null;
};

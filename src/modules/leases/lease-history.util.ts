import { Lease } from '@prisma/client';

export type LeaseHistoryFieldChange = {
  from: string | number | boolean | null;
  to: string | number | boolean | null;
};

export type LeaseHistoryChanges = Record<string, LeaseHistoryFieldChange>;

const leaseTrackedFields = [
  'status',
  'ijariId',
  'contractDate',
  'propertyUsage',
  'ownerNameSnapshot',
  'landlordNameSnapshot',
  'tenantNameSnapshot',
  'tenantEmailSnapshot',
  'landlordEmailSnapshot',
  'tenantPhoneSnapshot',
  'landlordPhoneSnapshot',
  'buildingNameSnapshot',
  'locationCommunity',
  'propertySizeSqm',
  'propertyTypeLabel',
  'propertyNumber',
  'premisesNoDewa',
  'plotNo',
  'contractValue',
  'paymentModeText',
  'leaseStartDate',
  'leaseEndDate',
  'tenancyRegistrationExpiry',
  'noticeGivenDate',
  'annualRent',
  'paymentFrequency',
  'numberOfCheques',
  'securityDepositAmount',
  'internetTvProvider',
  'serviceChargesPaidBy',
  'vatApplicable',
  'notes',
  'firstPaymentReceived',
  'firstPaymentAmount',
  'depositReceived',
  'depositReceivedAmount',
  'actualMoveOutDate',
  'forwardingPhone',
  'forwardingEmail',
  'forwardingAddress',
  'finalElectricityReading',
  'finalWaterReading',
  'finalGasReading',
  'wallsCondition',
  'floorCondition',
  'kitchenCondition',
  'bathroomCondition',
  'doorsLocksCondition',
  'keysReturned',
  'accessCardsReturnedCount',
  'parkingStickersReturned',
  'damageDescription',
  'damageCharges',
  'pendingRent',
  'pendingUtilities',
  'pendingServiceFines',
  'totalDeductions',
  'netRefund',
  'inspectionDoneBy',
  'inspectionDate',
  'managerApproval',
  'refundMethod',
  'refundDate',
  'adminNotes',
] as const;

type TrackedLeaseField = (typeof leaseTrackedFields)[number];
type TrackedLeaseLike = Partial<Record<TrackedLeaseField, unknown>>;

export const buildLeaseChangeSet = (
  previous: TrackedLeaseLike,
  current: TrackedLeaseLike,
): LeaseHistoryChanges => {
  const changes: LeaseHistoryChanges = {};

  for (const field of leaseTrackedFields) {
    const from = normalizeLeaseValue(previous[field]);
    const to = normalizeLeaseValue(current[field]);
    if (!Object.is(from, to)) {
      changes[field] = { from, to };
    }
  }

  return changes;
};

export const buildLeaseCreationChangeSet = (
  lease: Pick<Lease, TrackedLeaseField>,
): LeaseHistoryChanges => buildLeaseChangeSet({}, lease);

const normalizeLeaseValue = (
  value: unknown,
): string | number | boolean | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'constructor' in value &&
    typeof (value as { constructor?: { name?: unknown } }).constructor?.name ===
      'string' &&
    (value as { constructor?: { name?: string } }).constructor?.name ===
      'Decimal' &&
    'toString' in value &&
    typeof (value as { toString?: unknown }).toString === 'function'
  ) {
    return (value as { toString: () => string }).toString();
  }
  return String(value);
};

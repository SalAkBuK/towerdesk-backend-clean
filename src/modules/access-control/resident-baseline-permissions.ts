// Keep this list aligned with resident-facing routes that are gated by PermissionsGuard.
export const RESIDENT_BASELINE_PERMISSION_KEYS = [
  'resident.profile.read',
  'resident.profile.write',
  'resident.requests.read',
  'resident.requests.create',
  'resident.requests.update',
  'resident.requests.cancel',
  'resident.requests.comment',
  'resident.visitors.read',
  'resident.visitors.create',
  'resident.visitors.update',
  'resident.visitors.cancel',
  'resident.contracts.read',
  'resident.contracts.documents.read',
  'resident.contracts.documents.create',
  'resident.moves.read',
  'resident.moves.create',
  'notifications.read',
  'notifications.write',
  'messaging.read',
  'messaging.write',
] as const;

export type ResidentBaselinePermissionKey =
  (typeof RESIDENT_BASELINE_PERMISSION_KEYS)[number];

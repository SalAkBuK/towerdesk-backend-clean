export enum BroadcastAudience {
  TENANTS = 'tenants',
  ADMINS = 'admins',
  STAFF = 'staff',
  MANAGERS = 'managers',
  BUILDING_ADMINS = 'building_admins',
  ALL_USERS = 'all_users',
}

export const DEFAULT_BROADCAST_AUDIENCES: BroadcastAudience[] = [
  BroadcastAudience.TENANTS,
];

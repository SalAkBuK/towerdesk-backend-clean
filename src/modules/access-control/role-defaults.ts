import { AccessScopeType } from '@prisma/client';

export type RoleTemplateSeedDefinition = {
  key: string;
  name: string;
  description: string;
  scopeType: AccessScopeType;
};

export const ORG_SYSTEM_ROLE_TEMPLATE_KEYS = ['org_admin', 'viewer'] as const;
export const BUILDING_SYSTEM_ROLE_TEMPLATE_KEYS = [
  'building_admin',
  'building_manager',
  'building_staff',
] as const;

export const VISIBLE_SYSTEM_ROLE_TEMPLATE_KEYS = [
  ...ORG_SYSTEM_ROLE_TEMPLATE_KEYS,
  ...BUILDING_SYSTEM_ROLE_TEMPLATE_KEYS,
] as const;

export const RESERVED_ORG_ROLE_TEMPLATE_KEYS = ['platform_superadmin'] as const;

export const isVisibleRoleTemplate = (roleTemplate: {
  key: string;
  isSystem?: boolean | null;
}) => {
  if (roleTemplate.key === 'platform_superadmin') {
    return false;
  }

  if (roleTemplate.isSystem === false) {
    return true;
  }

  return VISIBLE_SYSTEM_ROLE_TEMPLATE_KEYS.includes(
    roleTemplate.key as (typeof VISIBLE_SYSTEM_ROLE_TEMPLATE_KEYS)[number],
  );
};

export const isReservedRoleTemplateKey = (key: string) =>
  RESERVED_ORG_ROLE_TEMPLATE_KEYS.includes(
    key as (typeof RESERVED_ORG_ROLE_TEMPLATE_KEYS)[number],
  );

export const isOrgAssignableRoleTemplate = (roleTemplate: {
  key: string;
  isSystem?: boolean | null;
  scopeType: AccessScopeType;
}) => {
  if (roleTemplate.scopeType !== AccessScopeType.ORG) {
    return false;
  }

  if (roleTemplate.key === 'platform_superadmin') {
    return false;
  }

  if (roleTemplate.isSystem === false) {
    return true;
  }

  return ORG_SYSTEM_ROLE_TEMPLATE_KEYS.includes(
    roleTemplate.key as (typeof ORG_SYSTEM_ROLE_TEMPLATE_KEYS)[number],
  );
};

export const SYSTEM_ROLE_TEMPLATE_DEFINITIONS: RoleTemplateSeedDefinition[] = [
  {
    key: 'org_admin',
    name: 'Org Admin',
    description: 'Org-wide administrator',
    scopeType: AccessScopeType.ORG,
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Org-wide read-only access',
    scopeType: AccessScopeType.ORG,
  },
  {
    key: 'building_admin',
    name: 'Building Admin',
    description: 'Full building-scoped administration',
    scopeType: AccessScopeType.BUILDING,
  },
  {
    key: 'building_manager',
    name: 'Building Manager',
    description: 'Building-scoped management access',
    scopeType: AccessScopeType.BUILDING,
  },
  {
    key: 'building_staff',
    name: 'Building Staff',
    description: 'Building-scoped operational staff access',
    scopeType: AccessScopeType.BUILDING,
  },
];

export const PLATFORM_ROLE_TEMPLATE_DEFINITIONS: RoleTemplateSeedDefinition[] =
  [
    {
      key: 'platform_superadmin',
      name: 'Platform Superadmin',
      description: 'Platform administrator',
      scopeType: AccessScopeType.ORG,
    },
  ];

export const ROLE_TEMPLATE_PERMISSION_MAP: Record<string, string[]> = {
  org_admin: [
    'users.read',
    'users.write',
    'roles.read',
    'roles.write',
    'dashboard.read',
    'buildings.read',
    'buildings.write',
    'buildings.delete',
    'units.read',
    'units.write',
    'unitTypes.read',
    'unitTypes.write',
    'building.assignments.read',
    'building.assignments.write',
    'occupancy.read',
    'occupancy.write',
    'leases.read',
    'leases.write',
    'leases.documents.read',
    'leases.documents.write',
    'leases.access_items.read',
    'leases.access_items.write',
    'leases.occupants.read',
    'leases.occupants.write',
    'leases.move_in',
    'leases.move_out',
    'contracts.read',
    'contracts.write',
    'contracts.documents.read',
    'contracts.documents.write',
    'contracts.occupants.read',
    'contracts.occupants.write',
    'contracts.move_in_request.create',
    'contracts.move_out_request.create',
    'contracts.move_requests.review',
    'contracts.move_in.execute',
    'contracts.move_out.execute',
    'residents.read',
    'residents.write',
    'residents.profile.read',
    'residents.profile.write',
    'owners.read',
    'owners.write',
    'owner_registry.resolve',
    'owner_access_grants.read',
    'owner_access_grants.write',
    'service_providers.read',
    'service_providers.write',
    'requests.read',
    'requests.write',
    'requests.assign',
    'requests.update_status',
    'requests.comment',
    'requests.owner_approval_override',
    'org.profile.write',
    'parkingSlots.create',
    'parkingSlots.read',
    'parkingSlots.update',
    'parkingAllocations.create',
    'parkingAllocations.read',
    'parkingAllocations.end',
    'vehicles.create',
    'vehicles.read',
    'vehicles.update',
    'vehicles.delete',
    'visitors.create',
    'visitors.read',
    'visitors.update',
    'broadcasts.read',
    'broadcasts.write',
    'notifications.read',
    'notifications.write',
    'messaging.read',
    'messaging.write',
  ],
  viewer: [
    'users.read',
    'roles.read',
    'dashboard.read',
    'buildings.read',
    'units.read',
    'unitTypes.read',
    'owners.read',
    'owner_access_grants.read',
    'service_providers.read',
    'residents.read',
    'residents.profile.read',
    'occupancy.read',
    'leases.read',
    'leases.documents.read',
    'leases.access_items.read',
    'leases.occupants.read',
    'contracts.read',
    'contracts.documents.read',
    'contracts.occupants.read',
    'requests.read',
    'parkingSlots.read',
    'parkingAllocations.read',
    'vehicles.read',
    'visitors.read',
    'broadcasts.read',
    'notifications.read',
    'notifications.write',
    'messaging.read',
  ],
  building_admin: [
    'buildings.read',
    'buildings.write',
    'units.read',
    'units.write',
    'building.assignments.read',
    'building.assignments.write',
    'occupancy.read',
    'occupancy.write',
    'leases.read',
    'leases.write',
    'leases.documents.read',
    'leases.documents.write',
    'leases.access_items.read',
    'leases.access_items.write',
    'leases.occupants.read',
    'leases.occupants.write',
    'leases.move_in',
    'leases.move_out',
    'contracts.read',
    'contracts.write',
    'contracts.documents.read',
    'contracts.documents.write',
    'contracts.occupants.read',
    'contracts.occupants.write',
    'contracts.move_requests.review',
    'contracts.move_in.execute',
    'contracts.move_out.execute',
    'residents.read',
    'residents.write',
    'residents.profile.read',
    'residents.profile.write',
    'requests.read',
    'requests.write',
    'requests.assign',
    'requests.update_status',
    'requests.comment',
    'parkingSlots.create',
    'parkingSlots.read',
    'parkingSlots.update',
    'parkingAllocations.create',
    'parkingAllocations.read',
    'parkingAllocations.end',
    'vehicles.create',
    'vehicles.read',
    'vehicles.update',
    'vehicles.delete',
    'visitors.create',
    'visitors.read',
    'visitors.update',
    'broadcasts.read',
    'broadcasts.write',
    'notifications.read',
    'notifications.write',
    'messaging.read',
    'messaging.write',
  ],
  building_manager: [
    'buildings.read',
    'buildings.write',
    'units.read',
    'units.write',
    'building.assignments.read',
    'leases.read',
    'leases.documents.read',
    'leases.access_items.read',
    'leases.occupants.read',
    'leases.move_in',
    'leases.move_out',
    'contracts.read',
    'contracts.documents.read',
    'contracts.occupants.read',
    'contracts.move_requests.review',
    'contracts.move_in.execute',
    'contracts.move_out.execute',
    'residents.read',
    'residents.write',
    'residents.profile.read',
    'residents.profile.write',
    'requests.read',
    'requests.write',
    'requests.assign',
    'requests.update_status',
    'requests.comment',
    'requests.owner_approval_override',
    'parkingSlots.read',
    'parkingAllocations.read',
    'vehicles.read',
    'visitors.create',
    'visitors.read',
    'visitors.update',
    'broadcasts.read',
    'broadcasts.write',
    'notifications.read',
    'notifications.write',
    'messaging.read',
    'messaging.write',
  ],
  building_staff: [
    'buildings.read',
    'units.read',
    'leases.read',
    'leases.documents.read',
    'leases.access_items.read',
    'leases.occupants.read',
    'contracts.read',
    'contracts.documents.read',
    'contracts.occupants.read',
    'residents.read',
    'residents.profile.read',
    'requests.read',
    'requests.update_status',
    'requests.comment',
    'parkingSlots.read',
    'parkingAllocations.read',
    'vehicles.read',
    'visitors.create',
    'visitors.read',
    'visitors.update',
    'broadcasts.read',
    'notifications.read',
    'notifications.write',
    'messaging.read',
    'messaging.write',
  ],
};

export const PLATFORM_ROLE_TEMPLATE_PERMISSION_MAP: Record<string, string[]> = {
  platform_superadmin: [
    'platform.org.create',
    'platform.org.read',
    'platform.org.admin.create',
    'platform.org.admin.read',
    'platform.delivery_tasks.read',
    'platform.delivery_tasks.retry',
    'platform.delivery_tasks.cleanup',
    'visitors.create',
    'visitors.read',
    'visitors.update',
  ],
};

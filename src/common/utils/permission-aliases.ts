export const PERMISSION_ALIASES: Record<string, string[]> = {
  'contracts.read': ['leases.read'],
  'contracts.write': ['leases.write'],
  'contracts.documents.read': ['leases.documents.read'],
  'contracts.documents.write': ['leases.documents.write'],
  'contracts.occupants.read': ['leases.occupants.read'],
  'contracts.occupants.write': ['leases.occupants.write'],
  'contracts.move_in.execute': ['leases.move_in'],
  'contracts.move_out.execute': ['leases.move_out'],
  'contracts.move_requests.review': ['leases.move_in', 'leases.move_out'],
  'contracts.move_in_request.create': ['leases.move_in'],
  'contracts.move_out_request.create': ['leases.move_out'],
  'leases.read': ['contracts.read'],
  'leases.write': ['contracts.write'],
  'leases.documents.read': ['contracts.documents.read'],
  'leases.documents.write': ['contracts.documents.write'],
  'leases.occupants.read': ['contracts.occupants.read'],
  'leases.occupants.write': ['contracts.occupants.write'],
  'leases.move_in': [
    'contracts.move_in.execute',
    'contracts.move_in_request.create',
    'contracts.move_requests.review',
  ],
  'leases.move_out': [
    'contracts.move_out.execute',
    'contracts.move_out_request.create',
    'contracts.move_requests.review',
  ],
  'service_providers.read': ['serviceProviders.read'],
  'service_providers.write': ['serviceProviders.write'],
  'serviceProviders.read': ['service_providers.read'],
  'serviceProviders.write': ['service_providers.write'],
};

export const hasPermissionMatch = (
  effectivePermissions: Set<string> | undefined,
  permission: string,
) => {
  if (effectivePermissions?.has(permission)) {
    return true;
  }

  const aliases = PERMISSION_ALIASES[permission] ?? [];
  return aliases.some((alias) => effectivePermissions?.has(alias));
};

export const hasAllPermissionMatches = (
  effectivePermissions: Set<string> | undefined,
  permissions: string[],
) =>
  permissions.every((permission) =>
    hasPermissionMatch(effectivePermissions, permission),
  );

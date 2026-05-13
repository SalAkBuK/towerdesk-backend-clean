import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANY_SCOPE_PERMISSIONS_KEY = 'allowAnyScopePermissions';

export const AllowAnyScopePermissions = () =>
  SetMetadata(ALLOW_ANY_SCOPE_PERMISSIONS_KEY, true);

export const PLATFORM_PERMISSION_PREFIX = 'platform.';

export const isPlatformPermissionKey = (key: string) =>
  key.startsWith(PLATFORM_PERMISSION_PREFIX);

export const listPlatformPermissionKeys = (keys: string[]) =>
  Array.from(new Set(keys.filter(isPlatformPermissionKey))).sort(
    (left, right) => left.localeCompare(right),
  );

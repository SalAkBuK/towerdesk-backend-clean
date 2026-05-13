import {
  hasAllPermissionMatches,
  hasPermissionMatch,
} from './permission-aliases';

describe('permission aliases', () => {
  it('matches snake_case service provider permissions from camelCase grants', () => {
    const effective = new Set([
      'serviceProviders.read',
      'serviceProviders.write',
    ]);

    expect(hasPermissionMatch(effective, 'service_providers.read')).toBe(true);
    expect(hasPermissionMatch(effective, 'service_providers.write')).toBe(true);
  });

  it('matches camelCase service provider permissions from snake_case grants', () => {
    const effective = new Set([
      'service_providers.read',
      'service_providers.write',
    ]);

    expect(hasPermissionMatch(effective, 'serviceProviders.read')).toBe(true);
    expect(hasPermissionMatch(effective, 'serviceProviders.write')).toBe(true);
  });

  it('supports mixed permission checks across naming styles', () => {
    const effective = new Set([
      'serviceProviders.read',
      'serviceProviders.write',
    ]);

    expect(
      hasAllPermissionMatches(effective, [
        'service_providers.read',
        'service_providers.write',
      ]),
    ).toBe(true);
  });
});

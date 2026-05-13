import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../types/request-context';

export const assertOrgScope = (user?: AuthenticatedUser): string => {
  const orgId = user?.orgId;
  if (!orgId) {
    throw new ForbiddenException('Org scope required');
  }
  return orgId;
};

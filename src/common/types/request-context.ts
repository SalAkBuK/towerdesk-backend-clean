import { Request } from 'express';

export type AuthenticatedUser = Record<string, unknown> & {
  sub: string;
  email?: string;
  orgId?: string | null;
};

export interface RequestContext extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
  refreshToken?: string;
  effectivePermissions?: Set<string>;
}

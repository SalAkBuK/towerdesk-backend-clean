import { AccessScopeType } from '@prisma/client';
import { createHash } from 'crypto';

type AccessAssignmentIdentity = {
  userId: string;
  roleTemplateId: string;
  scopeType: AccessScopeType;
  scopeId?: string | null;
};

export const buildUserAccessAssignmentId = ({
  userId,
  roleTemplateId,
  scopeType,
  scopeId,
}: AccessAssignmentIdentity) =>
  createHash('md5')
    .update(
      [userId, roleTemplateId, scopeType, scopeId ?? ''].join(':'),
      'utf8',
    )
    .digest('hex');

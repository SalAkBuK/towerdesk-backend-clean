export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const describeEmailOwnershipConflict = (params: {
  existingOrgId?: string | null;
  targetOrgId?: string | null;
}) => {
  if (!params.existingOrgId) {
    return 'Email already belongs to a platform user';
  }

  if (params.targetOrgId && params.existingOrgId === params.targetOrgId) {
    return 'Email already in use in this organization';
  }

  return 'Email already belongs to a user in another organization';
};

export type PasswordResetEmailPurpose =
  | 'PASSWORD_RESET'
  | 'RESIDENT_INVITE'
  | 'OWNER_INVITE'
  | 'PROVIDER_INVITE';

export type PasswordEmailContext = {
  inviteeName?: string | null;
  inviterName?: string | null;
};

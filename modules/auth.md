# Auth Review

## Scope

- Source: `src/modules/auth`
- Main files:
  - `auth.controller.ts`
  - `auth.service.ts`
  - `auth.repo.ts`
  - `auth-validation.service.ts`
  - `guards/refresh-token.guard.ts`
  - `strategies/jwt.strategy.ts`
- Public routes:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `POST /auth/change-password`
  - `POST /auth/forgot-password`
  - `POST /auth/reset-password`
- Core responsibility: identity verification, token issuance, password lifecycle, and auth-payload projection for the rest of the platform.

## What This Module Really Owns

- Verifying email/password credentials.
- Issuing access and refresh JWTs.
- Persisting the refresh-token hash on the user row.
- Starting password-reset and invite-completion flows.
- Completing password reset and activating related downstream access when relevant.
- Validating access-token payloads against current database truth instead of trusting stale JWT claims.

## Step-By-Step Request Flows

### 1. Register

1. Controller accepts `POST /auth/register`.
2. Service checks `AUTH_PUBLIC_REGISTER_ENABLED`.
3. Email is normalized with `normalizeEmail(...)`.
4. Existing user check runs through `AuthRepo.findByEmail(...)`.
5. Password is hashed with Argon2.
6. User row is created.
7. Access and refresh tokens are signed.
8. Refresh token is hashed again and stored on the user row.
9. Response payload is built through `UserAccessProjectionService`.

### 2. Login

1. Controller accepts `POST /auth/login`.
2. Service loads the user by normalized email.
3. Inactive or missing users are rejected with `UnauthorizedException`.
4. Password is verified with Argon2.
5. New access and refresh tokens are signed.
6. New refresh-token hash overwrites the previous one.
7. Full projected user/access payload is returned.

### 3. Refresh

1. Controller accepts `POST /auth/refresh`.
2. `RefreshTokenGuard` authenticates the route.
3. Service loads the user by id.
4. Stored refresh-token hash is compared against the submitted refresh token.
5. New tokens are issued.
6. Stored refresh-token hash is rotated.
7. Response includes a newly projected user payload.

### 4. Logout

1. Controller accepts `POST /auth/logout`.
2. `JwtAuthGuard` authenticates the current user.
3. Service clears `refreshTokenHash`.
4. Future refresh attempts fail until a new login happens.

### 5. Change Password

1. Controller accepts `POST /auth/change-password`.
2. Current access token authenticates the user.
3. Service loads the active user row.
4. Current password is verified.
5. New password is hashed and stored.
6. `mustChangePassword` is cleared.

### 6. Forgot Password / Invite Email

1. Controller accepts `POST /auth/forgot-password`.
2. Service normalizes email and looks up the user.
3. Unknown or inactive users return generic success.
4. A random token is generated and SHA-256 hashed for storage.
5. Any previous password-reset tokens for that user are deleted.
6. New reset token row is created with expiry.
7. Depending on purpose, resident invite metadata may also be created.
8. Email is sent using `EmailService`.
9. If email sending fails for resident invites, invite status is marked `FAILED`.
10. Caller still gets `{ success: true }`.

### 7. Reset Password

1. Controller accepts `POST /auth/reset-password`.
2. Service hashes the submitted token.
3. Repo transaction loads the token row and user row.
4. Invalid, expired, used, or inactive-user tokens fail.
5. User password is updated.
6. `mustChangePassword` is cleared.
7. `refreshTokenHash` is cleared.
8. Reset token is marked used.
9. Related resident invites are marked accepted.
10. Pending owner access grants are activated and audited.
11. Pending provider access grants are activated.
12. Older reset tokens for the same user are deleted.

## Data And State Model

### Core tables touched

- `User`
  - `passwordHash`
  - `refreshTokenHash`
  - `mustChangePassword`
  - `isActive`
  - `orgId`
- `PasswordResetToken`
  - `tokenHash`
  - `expiresAt`
  - `usedAt`
- `ResidentInvite`
  - `status`
  - `tokenHash`
  - `failedAt`
  - `acceptedAt`
- `OwnerAccessGrant`
- `OwnerAccessGrantAudit`
- `ServiceProviderAccessGrant`
- `Notification`

### Important state transitions

- `User.refreshTokenHash`
  - `null -> hash` on login/register/refresh
  - `hash -> null` on logout/reset-password
- `ResidentInvite.status`
  - `SENT -> FAILED` when invite delivery throws
  - `SENT -> ACCEPTED` when password setup succeeds
- `OwnerAccessGrant.status`
  - `PENDING -> ACTIVE` after successful password setup for the invited user
- `ServiceProviderAccessGrant.status`
  - `PENDING -> ACTIVE` after successful password setup for the invited user

## Edge Cases And Important Scenarios

### Identity / access edge cases

- Registration is disabled unless `AUTH_PUBLIC_REGISTER_ENABLED=true`.
- Email matching is case-insensitive.
- Inactive users are rejected for login and auth validation.
- JWT `orgId` is not treated as authoritative; current DB org scope wins.
- Platform superadmins can operate with `orgId=null` and use explicit org override.

### Token edge cases

- Only one refresh-token hash is stored per user, so a new login invalidates prior refresh state.
- Reset tokens are single-use.
- Creating a new reset token deletes older ones for the same user.
- Reset-password also clears refresh-token state, forcing re-authentication on old sessions.

### Invite / onboarding edge cases

- Forgot-password for unknown emails still returns success.
- Resident invite flows can create invite records only when the user has an `orgId`.
- Owner and provider invite completion is piggybacked on reset-password completion.
- Email delivery failure does not fail the API response, but resident invites are marked failed for recovery.
- Invite URLs append `mode=invite` when applicable.

### Operational edge cases

- If reset-token email sending fails, the token row still exists.
- If password-reset URL template is missing, the system falls back to token-based instructions.
- App-store/deep-link onboarding text degrades gracefully when mobile URLs are not configured.

## Strengths

- Good separation between controller, service, repo, and payload projection.
- Generic forgot-password response avoids account enumeration.
- Reset-password is transactional and handles downstream side effects in one place.
- Auth validation explicitly corrects stale token org scope using database truth.
- Invite onboarding has real business behavior, not only generic reset emails.

## Risks And Design Weaknesses

### 1. Single refresh-token slot per user

- Current model stores one `refreshTokenHash` on the user row.
- Result: no per-device session tracking, no selective revocation, and last-login-wins behavior.
- This is acceptable early on, but it becomes limiting for multi-device auditability and session management.

### 2. Reset-password flow is carrying multiple domain side effects

- A password setup can activate resident-invite completion, owner access, provider access, and create a notification.
- The transaction is coherent, but the auth module is now partially responsible for downstream onboarding completion in other domains.
- That is convenient now, but it raises coupling.

### 3. Email sending is still part of the request path conceptually

- Delivery failures are caught, but the workflow is still request-driven rather than queue-driven.
- Retries, observability, and delivery guarantees are therefore weaker than they could be.

### 4. Limited auth audit trail

- There is logging, but not a strong first-class auth audit history for login attempts, lockouts, password resets, or suspicious patterns.

### 5. No explicit session management model

- Logout clears refresh state, but there is no notion of "list my active sessions", "logout other devices", or "revoke one device".

## Improvement Opportunities

### High priority

- Introduce per-session refresh tokens stored in a dedicated session table.
- Add auth audit records for login success/failure, password change, password reset requested, password reset completed, and logout.
- Move password-reset and invite email sending to queue-backed jobs with retry and dead-letter visibility.

### Medium priority

- Separate invite-completion orchestration from core auth concerns so downstream activation logic is easier to maintain.
- Add lockout, anomaly detection, or incremental delay for repeated failed logins.
- Add explicit admin tooling or metrics for failed invite sends and expired reset tokens.

### Lower priority

- Support richer session/device metadata.
- Consider MFA if the platform scope and owner/provider surfaces continue expanding.

## Concrete Review Questions For Your Lead

1. Is the single-refresh-token-per-user model acceptable for the product stage you are in?
2. Do you want auth to remain the onboarding-completion orchestrator for owners/providers/residents, or should that be split?
3. Is queue-backed email delivery now justified by invite/reset criticality?
4. Do you need auditable session management for admins, owners, or providers?
5. Is MFA or suspicious-login tracking on the near-term roadmap?

## Testing Signals

### Unit coverage already present

- `auth.service.spec.ts`
- `auth.repo.spec.ts`
- `auth-validation.service.spec.ts`

### Notable cases already tested

- Public registration disabled.
- Auth payload includes projected org/building/resident access.
- Refresh token rotation and logout invalidation.
- Generic forgot-password success for unknown users.
- Resident invite email composition and `mode=invite` handling.
- Resident invite failure state when email delivery throws.
- Password reset success/failure.
- Reset-password activation of pending owner access grants.
- Stale JWT org claim corrected from database truth.
- Platform-superadmin org override validation.

## Suggested Follow-On Docs

- A small auth sequence diagram for login, refresh, forgot-password, and reset-password.
- A separate onboarding document showing how resident invite, owner invite, and provider invite all converge through auth reset completion.

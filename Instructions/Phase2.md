Implement simple org bootstrap without email/invite tokens.

Context: NestJS + Prisma + Postgres. Phase 1 org scoping exists with Org, Building, User.orgId and org-scope guard. Platform endpoints are under /platform and protected by PLATFORM_API_KEY.

Goal: Let platform (superadmin/dev portal) create an Organization and its first Org Admin user with a password (no emails, no invite tokens).

Requirements
1) Add platform endpoint:
- POST /platform/orgs/:orgId/admins
  Body DTO: { name: string, email: string, password?: string }
  Behavior:
  - Validate org exists.
  - Create a new User with orgId = :orgId
  - Assign role ORG_ADMIN (use existing RBAC system).
  - If password not provided, generate a strong random temp password and return it in response.
  - Set user.mustChangePassword = true (new field) when user created via platform.
  - Return: { userId, email, tempPassword?, mustChangePassword: true }

2) Schema changes
- Add User.mustChangePassword boolean default false
- Migration included.

3) Auth changes
- Add endpoint POST /auth/change-password
  - Requires auth
  - Body: { currentPassword, newPassword }
  - Updates password hash
  - Sets mustChangePassword=false
- On login response, include mustChangePassword so UI can force password update.

4) Security
- /platform routes require PLATFORM_API_KEY guard.
- Never allow orgId from body; always use path orgId.
- Email uniqueness should be enforced per org OR globally (choose one and document it). Prefer global unique email for simplicity.

5) Tests
- E2E: platform can create org admin
- E2E: platform rejects without PLATFORM_API_KEY
- E2E: created admin can login and mustChangePassword=true
- E2E: change-password clears mustChangePassword

Output
- Provide code changes (controllers/services/dtos/guards/prisma migration/tests)
- Update README with how to use platform endpoint and login with generated password.

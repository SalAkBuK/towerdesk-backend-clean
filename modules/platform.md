# Platform Review

## Scope

- Source: `src/modules/platform`
- Public routes:
  - `GET|POST /platform/orgs`
  - `GET|POST /platform/orgs/:orgId/admins`
  - `GET /platform/org-admins`
- Core responsibility: bootstrap orgs and org admins from a platform-superadmin context.

## Main Workflows

1. Platform authentication.
   - Supports either `x-platform-key` or a platform-superadmin JWT.
2. Org creation.
   - Creates the org and seeds its default RBAC structure.
3. Org-admin bootstrap.
   - Creates an admin user with the required access and a first-login password flow.
4. Cross-org supervision.
   - Platform users can inspect org and admin data but should remain separate from org-scoped routes unless explicitly acting with override context.

## Important Edge Cases And Scenarios

- Platform access is denied without the platform key or required superadmin permissions.
- Platform users are blocked from ordinary org routes unless the flow explicitly supports org override.
- New org admins can be forced through `mustChangePassword`.
- The backend supports platform users who have no default org in their token context.

## Review Focus

- Org creation is not just data insertion; it is also a bootstrapping workflow for permissions and seeded access.
- This module is a high-trust path, so missing audit or monitoring here carries outsized risk.
- Platform and org scopes intentionally behave differently, which is correct but easy to confuse in maintenance work.

## Improvement Opportunities

- Add a stronger audit trail for org creation, org-admin creation, and any platform impersonation/override flow.
- Add platform-level rate limiting and alerting because these routes are especially sensitive.
- Document rollback expectations if org creation partially succeeds after downstream failures.
- Add explicit support for org suspension or lifecycle management, not only bootstrap.

## Testing Signals

- `test/platform-org-admin.e2e.spec.ts` covers platform auth, org-admin creation, access separation, and password-change completion behavior.

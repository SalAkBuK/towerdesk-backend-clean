You are Codex working in our NestJS + TypeScript backend (Towerdesk). Implement “Org + User Profiles” with Cloudinary UNSIGNED uploads (preset-based). Do NOT add signed upload logic. Do NOT delete old Cloudinary assets (ignore cleanup for MVP).

CONTEXT / CURRENT STATE
- Prisma + Postgres, JWT auth, global RBAC permission keys, seeded roles (including role key `org_admin`) in `seed.ts`.
- Access checks are permission-key based (roles are just bundles of permissions).
- Residents can update their own display name (User.name) + avatar/phone.
- Residents do NOT need a staff directory.
- Cloudinary:
  - cloud name: your Cloudinary cloud name
  - we will use an UNSIGNED upload preset on the frontend; backend does not upload files.
  - backend stores returned `secure_url` only.

GOALS
1) Add Org “profile” fields so tenant branding is visible to all users in the org and editable by org admins.
2) Add User “profile” fields so each user can view/update their own name/avatar/phone.
3) Minimal endpoints + minimal schema changes + E2E tests.
4) Update docs (README.md + API.md) for frontend usage.
5) Keep changes scoped; follow existing patterns.

DATA MODEL (Prisma)
- Add to `Org`:
  - logoUrl String?  (stores Cloudinary secure_url)
- Add to `User`:
  - avatarUrl String?
  - phone String?
Notes:
- Do NOT create new tables unless strongly required by existing conventions.
- Add a migration SQL accordingly.

PERMISSIONS / SEED
- Add new permission key: `org.profile.write`
- Seed: grant `org.profile.write` to role key `org_admin` by default (since org_admin is how we assign org admin capabilities).
- No permission key required for self profile update endpoints (authenticated users can update themselves).

ENDPOINTS (minimal)
A) Org profile
- GET `/api/org/profile`
  - Requires auth (JWT) and `req.user.orgId` present.
  - Returns: { id, name, logoUrl }
  - Accessible to any authenticated user in org (resident/staff/admin).
- PATCH `/api/org/profile`
  - Requires permission `org.profile.write`
  - Body: { name?: string, logoUrl?: string }
  - Update only the current user’s org (orgId from JWT).
  - Validate logoUrl looks like an https URL (basic validation); no Cloudinary API calls.
  - Return updated org profile.

B) User profile (self only)
- PATCH `/api/users/me/profile`
  - Requires auth.
  - Body: { name?: string, avatarUrl?: string, phone?: string }
  - Must update only req.user.id.
  - Validate avatarUrl is https URL (basic) and phone is string (optional).
  - Return updated user (or profile subset).
Also ensure GET `/api/users/me` includes avatarUrl + phone (if that endpoint already exists), so frontend can read the profile in one call.

CONTROLLERS / MODULES
Implement in existing modules if appropriate:
- Prefer adding an `OrgProfileController` under an org module OR extend the existing org/buildings module style if one exists.
- For self profile update, extend existing UsersController (or create a minimal controller if users controller doesn’t exist).
Use DTOs + class-validator consistent with repo.

CLOUDINARY UPLOAD INSTRUCTIONS (docs only)
- Backend should NOT implement upload endpoints.
- Document frontend flow:
  1) Frontend uploads directly to Cloudinary using UNSIGNED upload preset.
  2) Cloudinary returns `secure_url`.
  3) Frontend calls PATCH /api/org/profile with logoUrl OR PATCH /api/users/me/profile with avatarUrl.

E2E TESTS
Add E2E tests covering:
1) Any authenticated org user can GET /api/org/profile and sees name/logoUrl.
2) PATCH /api/org/profile:
   - org_admin (with org.profile.write via seed) can update name and logoUrl.
   - non-admin (no org.profile.write) gets 403.
3) PATCH /api/users/me/profile:
   - any authenticated user (including resident) can update their own name/avatarUrl/phone.
   - ensure it does NOT allow updating another user (no :id route; verify userId unchanged).
4) Cross-org isolation:
   - User from another org cannot see/update org profile (404 or 403 per existing patterns; prefer 404 for cross-org resource non-leak).

DOCS
Update README.md + API.md:
- Add “Org Profile” section with GET/PATCH endpoints.
- Add “User Profile” section with PATCH endpoint.
- Add Cloudinary unsigned upload usage snippet (no secrets in backend).
- Mention new permission key `org.profile.write` and that org_admin role includes it by default via seed.

CONSTRAINTS
- Keep changes minimal and consistent with existing RBAC checks and org scoping behavior.
- Do not add Cloudinary SDK usage in backend.
- Do not implement staff directories.
- Do not implement deletion/cleanup of old images.

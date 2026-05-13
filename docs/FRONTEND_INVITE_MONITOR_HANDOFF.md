# Frontend Handoff: Resident Invite Monitoring

Use this guide to wire invite monitoring in the management portal using the current backend behavior.

## Scope

- Applies to resident onboarding/invite visibility in org portal.
- Uses invite tracking endpoints added to backend.
- API base prefix is `/api` if your gateway is configured that way.

## Current Backend Behavior (Important)

1. Creating a resident can send an invite via onboarding token flow.
2. `sendInvite` defaults to `true` on create resident payload.
3. Resend invite endpoint exists.
4. Backend now persists invite attempts/status in `ResidentInvite`.
5. Email send errors are logged server-side and do not fail the API response.
6. Provider-level events (delivered/opened/bounced) are still not tracked.
7. Invite links reuse reset URL template and include `mode=invite`; plain reset links include `mode=reset`.
8. Invite email includes onboarding steps:
   - set password
   - open/download app
   - submit move-in request after login

## Endpoints To Use

### List invites (primary data source)

- `GET /org/residents/invites?status=ALL|PENDING|ACCEPTED|FAILED|EXPIRED&limit=50&cursor=...&q=...`
- Permission: `residents.read`
- Use this endpoint to drive invite monitor table rows.

### Create resident

- `POST /org/residents`
- Permission: `residents.write`
- `user.sendInvite` defaults to `true`.
- Response includes `inviteSent` (request intent, not provider delivery confirmation).

### Resend invite

- `POST /org/residents/:userId/send-invite`
- Permission: `residents.write`
- Response: `{ "success": true }`
- Backend cooldown applies per resident (default 60s).
- If resend is too soon, backend returns `409` with a retry message.

### Invite link contract

- Invite email CTA points to the same reset-password entry route but with `mode=invite`.
- Frontend should switch copy when `mode=invite`:
  - Page title/CTA: `Set password`
  - Success copy: onboarding phrasing
- Frontend should use normal forgot-password/reset wording when `mode=reset` or no mode is present.
- Optional app CTA sources in backend env:
  - `MOBILE_APP_IOS_URL`
  - `MOBILE_APP_ANDROID_URL`
  - `MOBILE_APP_DEEP_LINK_URL`

## Data Fields To Render

From each `GET /org/residents/invites` row:

- `inviteId`
- `status` (`PENDING` | `ACCEPTED` | `FAILED` | `EXPIRED`)
- `sentAt`
- `expiresAt`
- `acceptedAt`
- `failedAt`
- `failureReason`
- `user.id`
- `user.email`
- `user.name`
- `user.isActive`
- `user.mustChangePassword`
- `createdByUser` (optional)

## Invite Status Source

- Use API `status` directly.
- Do not infer invite status from `mustChangePassword` anymore.
- `mustChangePassword` is still useful as secondary onboarding indicator.

## Portal UX Recommendations

### Invite monitor table

- Add column: `Invite Status` (from invite row).
- Add column: `Sent At`.
- Add column: `Expires At`.
- Add column: `Accepted At` (nullable).
- Add column: `Last Failure` (nullable).
- Add row action: `Resend Invite`.

### Action enable/disable

- `Resend Invite` enabled when:
  - user is active
  - invite status is `PENDING` or `EXPIRED` or `FAILED`
- Optional: allow resend for `ACCEPTED` with confirmation.

### Confirmation copy

- "Resend onboarding invite to {email}? This sends a new setup-password link."

### Success/error toasts

- Success: "Invite sent."
- Error: use backend error message; fallback "Failed to send invite."

## Suggested Frontend API Layer

```ts
listResidentInvites(query);
createOrgResident(payload);
resendResidentInvite(userId);
```

Example resend:

```ts
await api.post(`/org/residents/${userId}/send-invite`);
```

## Suggested Query Defaults

- Invite monitor page default:
  - `GET /org/residents/invites?status=PENDING&limit=50`
- Triage view:
  - `GET /org/residents/invites?status=FAILED&limit=50`
- Audit view:
  - `GET /org/residents/invites?status=ALL&limit=50`

## Known Limitations (Current Backend)

1. Provider delivery/open/bounce webhook state is not available yet.
2. `inviteSent` on create confirms request path, not inbox delivery.
3. No per-provider message-id linkage yet.

## Optional Backend Enhancements (Next)

1. Add provider message-id + webhook ingestion for delivery lifecycle.
2. Add dedicated endpoint to fetch invite history per resident user.

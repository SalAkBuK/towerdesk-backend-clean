# Mobile Handoff: Former Resident Access After Move-Out

Use this file as the source of truth for how the mobile app should behave after
a resident's contract has ended and the resident has moved out.

## Decision Summary

When a resident has completed move-out and their latest contract is `ENDED` or
`CANCELLED`, they should still be allowed to log into the mobile app as long as
their user account remains active.

They should not continue using the app as an active resident. Instead, the app
should switch them into a restricted "former resident" state.

This means:

- Keep account access.
- Remove active-resident actions.
- Keep access to historical and self-service information that still makes sense.

## Why

This fits both product needs and current backend behavior:

- Former residents may still need to review contract records.
- They may still need to check documents, deposit/refund details, or support
  history.
- The backend already gates most unit-scoped actions by active occupancy or
  active lease.
- Login is account-based, not contract-based.

## Current Backend Behavior

## Login

- Login is allowed if the user exists and `isActive = true`.
- Login is not blocked when a contract is `ENDED` or `CANCELLED`.

## Resident Identity State

- `GET /resident/me` can return `occupancy: null` when the resident is no
  longer assigned to a unit.
- `GET /resident/lease/active` returns `null` when there is no active lease.
- `GET /resident/contracts/latest` still returns the latest contract summary for
  the resident.
- `GET /resident/contracts` supports contract history across:
  - `DRAFT`
  - `ACTIVE`
  - `ENDED`
  - `CANCELLED`

## Actions That Should Be Disabled After Move-Out

These flows depend on active occupancy or active contract and should be treated
as unavailable in the app once the resident becomes a former resident:

- Move-in request for the ended contract
- Move-out request for the ended contract
- Visitors
- Active parking allocation actions
- New maintenance request creation
- New "message management" conversation creation

In practice, the backend already blocks most of these when active occupancy or
active contract is missing.

## Actions That Can Still Make Sense

These should remain visible or accessible in some form:

- View profile
- View latest contract
- View contract history
- View contract documents
- View previous maintenance requests
- View existing conversations
- Read notifications relevant to the user

Important note:

- Existing maintenance requests and existing conversations may still be readable
  or interactive depending on backend ownership/participant checks.
- The mobile app should treat these as history/support surfaces, not as proof
  that the resident is still active in the building.

## Mobile App Behavior

## Former Resident Mode

The app should enter former resident mode when:

- `GET /resident/me` returns `occupancy = null`, and
- the latest contract status is `ENDED` or `CANCELLED`, or
- `GET /resident/lease/active` returns `null` and there is no active occupancy.

Recommended UI treatment:

- Show a clear state such as `No active unit` or `Former resident`.
- Remove or disable active-building actions from the home screen.
- Keep history and profile areas accessible.

## Home Screen Rules

Show:

- Profile
- Latest contract summary
- Contract history
- Documents
- Support/history entry points

Hide or disable:

- Invite visitors
- Request move-out
- Request move-in for the ended contract
- Parking actions that require active allocation
- New maintenance request creation
- Start new management conversation tied to the building

## Recommended User Message

Suggested copy:

> You no longer have an active unit in this building. You can still view your
> previous contract details and history here.

Optional support copy:

> If you need help with your final settlement, documents, or deposit follow-up,
> contact management support.

## API Guidance For Mobile

On app launch after login:

1. Call `GET /resident/me`
2. Call `GET /resident/contracts/latest`
3. Optionally call `GET /resident/lease/active`

Use this interpretation:

- If `occupancy` exists and latest contract is `ACTIVE`, treat user as active
  resident.
- If `occupancy` is `null` and latest contract is `ENDED` or `CANCELLED`,
  treat user as former resident.
- If there is no contract at all, treat user as resident account with no active
  tenancy context.

## Status Matrix

| State | Login | View contract history | Visitors | New maintenance request | New message to management |
| --- | --- | --- | --- | --- | --- |
| Active resident | Yes | Yes | Yes | Yes | Yes |
| Former resident | Yes | Yes | No | No | No |
| Deactivated user | No | No | No | No | No |

## Operational Recommendation

Recommended business flow:

1. Execute move-out.
2. Keep the resident user active for a post-move-out period.
3. Allow restricted app access in former resident mode.
4. After all operational follow-up is complete, optionally deactivate the user
   if the business wants hard offboarding.

This is better than immediate login removal because it avoids cutting off access
to contract history, documents, and post-tenancy support.

## If the Business Wants Hard Offboarding

If the product decides that former residents must not access the app at all,
that should be handled as a separate business rule by deactivating the user
account.

That is not the current backend contract/occupancy behavior by default.

## Recommendation To Mobile Team

Implement former resident mode now.

Do not assume that `ENDED` or `CANCELLED` means the user should be logged out.
Instead:

- use active occupancy plus latest contract status to determine capability
- keep read/history surfaces available
- remove action surfaces that require active tenancy

## Future-Proofing

If the same resident later receives a new active contract and active occupancy,
the app should automatically return to normal active-resident mode.

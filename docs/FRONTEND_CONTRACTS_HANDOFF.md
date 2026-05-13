# Frontend Handoff: Contracts + Move Requests

Use this file as the source of truth for frontend integration with the new contract flow.

## Base

- API prefix: `/api` (if your gateway uses `/api` in front of Nest routes).
- Auth: Bearer JWT.
- Org-scoped endpoints require org user context.

## Agreed Flow (Locked)

1. Management creates a `DRAFT` contract against a unit + tenant.
2. Management fills legal/registry details.
3. Management activates the contract (`DRAFT -> ACTIVE`).
4. Tenant can create move-in request only when:
   - Contract is `ACTIVE`
   - Tenant is not moved in yet (`occupancyId == null`)
5. Management approves/rejects move-in request.
6. On approved move-in execute:
   - Occupancy becomes `ACTIVE`
   - Contract remains `ACTIVE`
7. Tenant can create move-out request only when:
   - Contract is `ACTIVE`
   - Tenant is already moved in (`occupancyId != null`)
8. Management approves/rejects move-out request.
9. On approved move-out execute:
   - Occupancy becomes `ENDED`
   - Contract becomes `ENDED` (or `CANCELLED` for early termination)

## Other Locked Decisions

- `lease` renamed to `contract` at API/UI level first (DB model remains `Lease` for now).
- `/contracts` endpoints are canonical; `/leases` are kept for backward compatibility.
- Approval is required for both move-in and move-out requests.
- UAE scope is Dubai Ejari first, extensible later.
- Primary tenant plus optional additional terms are supported.
- `BUILDING_ADMIN` remains building-scoped only. It does not implicitly become org `admin`.
- Auth/user payloads may expose `role: "building_admin"` as a display role when no higher org/platform role applies.

## Contract Endpoints (Org)

- `POST /org/buildings/:buildingId/contracts`
- `GET /org/contracts`
- `GET /org/contracts/:contractId`
- `PATCH /org/contracts/:contractId`
- `POST /org/contracts/:contractId/activate`
- `POST /org/contracts/:contractId/cancel`
- `PUT /org/contracts/:contractId/additional-terms`
- `GET /org/residents/:userId/contracts/latest`

## Move Request Endpoints

Management screens can use:

- `GET /org/move-requests/inbox-count`
- `GET /notifications?type=MOVE_IN_REQUEST_CREATED|MOVE_OUT_REQUEST_CREATED`

### Resident

- `GET /resident/contracts/:contractId`
- `GET /resident/contracts/latest`
- `POST /resident/contracts/:contractId/move-in-requests`
- `POST /resident/contracts/:contractId/move-out-requests`

### Management == Portal

- `GET /org/buildings/:buildingId/move-in-requests?status=PENDING|APPROVED|REJECTED|CANCELLED|COMPLETED|ALL`
- `GET /org/buildings/:buildingId/move-out-requests?status=PENDING|APPROVED|REJECTED|CANCELLED|COMPLETED|ALL`
- `POST /org/move-in-requests/:requestId/approve`
- `POST /org/move-in-requests/:requestId/reject`
- `POST /org/move-out-requests/:requestId/approve`
- `POST /org/move-out-requests/:requestId/reject`
- `POST /org/contracts/:contractId/move-in/execute`
- `POST /org/contracts/:contractId/move-out/execute`

Authorization note:

- Create draft contract follows building-scoped write access: org users with `contracts.write` can create, and assigned `BUILDING_ADMIN` users can also create for their building.
- Move-request list endpoints follow building-scoped read access rules for that building.
- Move-request approve/reject and move execute endpoints require the relevant contract permission and building linkage to the related building.
- Building linkage for those sensitive actions means assigned `MANAGER` or `BUILDING_ADMIN` for that building.
- Residents creating move-in/move-out requests now generate notifications for building managers/building admins and org admins.
- `GET /org/move-requests/inbox-count` returns pending counts for move-in, move-out, and total requests visible to the current org user.

## Contract Statuses

- `DRAFT`
- `ACTIVE`
- `ENDED`
- `CANCELLED`

## Contract Response Notes

- Contract responses now include raw `status` plus derived `displayStatus`.
- Use `displayStatus` for badges/list labels in UI.
- `displayStatus` can be:
  - `DRAFT`
  - `ACTIVE`
  - `CANCELLED`
  - `MOVED_OUT`
- Early move-out can persist raw `status = CANCELLED` while
  `displayStatus = MOVED_OUT`.
- Contract responses also expose `actualMoveOutDate` when the contract has been
  moved out.

## Key UI Rules

- `Add Contract` button: show for users who can create contracts for the selected building.
- Contracts list/detail badges should render `displayStatus`, not raw `status`.
- `View Contract`: use latest contract endpoint for tenant/resident.
- `Move-In Request` button: show for tenant when latest contract is `ACTIVE` and `occupancyId == null`.
- `Move-Out Request` button: show for tenant when contract is `ACTIVE` and tenant already moved in (`occupancyId != null`).
- `Move-Out Execute` button: management-only after approved move-out request.
- Disable move request action when latest same-type request status is `PENDING` or `APPROVED`.
- Building-admin users can create draft contracts for their assigned building even without an org-wide `contracts.write` role grant.
- Move-request building lists follow generic building-scoped read access, so do not assume `contracts.move_requests.review` is the only path to visibility.
- Management approve/reject/execute actions: show only when the user has the required contract permission and is linked to the building as `MANAGER` or `BUILDING_ADMIN`.
- Do not treat `building_admin` as org-wide `admin` in UI role handling.

## Tenant Onboarding

- Tenant login stays in existing mobile app.
- Resident creation supports invite flag (`user.sendInvite`, default `true`) and uses password reset link flow.
- Resend invite endpoint: `POST /org/residents/:userId/send-invite`.

## Request Payloads

### Create Draft Contract

`POST /org/buildings/:buildingId/contracts`

```json
{
  "unitId": "uuid",
  "residentUserId": "uuid",
  "contractPeriodFrom": "2026-03-10T00:00:00.000Z",
  "contractPeriodTo": "2027-03-09T23:59:59.000Z",
  "annualRent": "48000.00",
  "paymentFrequency": "QUARTERLY",
  "numberOfCheques": 4,
  "securityDepositAmount": "5000.00",
  "ijariId": "EJARI-123",
  "contractDate": "2026-03-09T00:00:00.000Z",
  "propertyUsage": "RESIDENTIAL",
  "ownerNameSnapshot": "Owner Name",
  "landlordNameSnapshot": "Landlord Name",
  "tenantNameSnapshot": "Tenant Name",
  "tenantEmailSnapshot": "tenant@example.com",
  "tenantPhoneSnapshot": "+971501234567",
  "buildingNameSnapshot": "Tower A",
  "locationCommunity": "Al Barsha South Fourth",
  "propertySizeSqm": "31.43",
  "propertyTypeLabel": "Studio",
  "propertyNumber": "335",
  "premisesNoDewa": "681-63951-2",
  "plotNo": "132",
  "contractValue": "48000.00",
  "paymentModeText": "4 cheques",
  "additionalTerms": ["No subletting", "Pets allowed with approval"]
}
```

### Update Contract

`PATCH /org/contracts/:contractId` sends partial fields.

Important:

- If contract is `ACTIVE` and `ijariId` exists, legal-field edits return `409`.
- Handle this with a blocking message in UI (amendment/renewal flow needed).

### Replace Additional Terms

`PUT /org/contracts/:contractId/additional-terms`

```json
{
  "terms": ["Term 1", "Term 2", "Term 3"]
}
```

### Create Move Request (Resident)

`POST /resident/contracts/:contractId/move-in-requests` and move-out equivalent:

```json
{
  "requestedMoveAt": "2026-03-15T10:00:00.000Z",
  "notes": "Need service elevator slot."
}
```

### Reject Move Request (Management)

```json
{
  "rejectionReason": "Requested time not available."
}
```

## Contract Response Shape (Main Fields)

```json
{
  "id": "uuid",
  "orgId": "uuid",
  "buildingId": "uuid",
  "unitId": "uuid",
  "occupancyId": null,
  "residentUserId": "uuid",
  "status": "DRAFT",
  "contractPeriodFrom": "2026-03-10T00:00:00.000Z",
  "contractPeriodTo": "2027-03-09T23:59:59.000Z",
  "ijariId": "EJARI-123",
  "propertyUsage": "RESIDENTIAL",
  "annualRent": "48000.00",
  "paymentFrequency": "QUARTERLY",
  "numberOfCheques": 4,
  "securityDepositAmount": "5000.00",
  "contractValue": "48000.00",
  "paymentModeText": "4 cheques",
  "additionalTerms": ["No subletting"],
  "resident": {
    "id": "uuid",
    "name": "Tenant Name",
    "email": "tenant@example.com",
    "phone": "+971501234567"
  },
  "unit": {
    "id": "uuid",
    "label": "335"
  },
  "createdAt": "2026-03-09T00:00:00.000Z",
  "updatedAt": "2026-03-09T00:00:00.000Z"
}
```

## Move Request Response Shape

```json
{
  "id": "uuid",
  "leaseId": "uuid",
  "residentUserId": "uuid",
  "buildingId": "uuid",
  "unitId": "uuid",
  "status": "PENDING",
  "requestedMoveAt": "2026-03-15T10:00:00.000Z",
  "notes": "Need service elevator slot.",
  "reviewedByUserId": null,
  "reviewedAt": null,
  "rejectionReason": null,
  "createdAt": "2026-03-09T11:00:00.000Z",
  "updatedAt": "2026-03-09T11:00:00.000Z"
}
```

## Tenant List / Resident Directory

- `GET /org/buildings/:buildingId/resident-directory` now includes:
  - `latestContractId`
  - `canAddContract`
  - `canViewContract`
  - `canRequestMoveIn`
  - `canRequestMoveOut`
  - `canExecuteMoveOut`

## Backward Compatibility

- Existing `/org/leases/*` endpoints still exist.
- New frontend should use `/org/contracts/*` and `/resident/contracts/*`.

## Suggested Frontend API Layer

```ts
listContracts(query)
getContract(contractId)
createContract(buildingId, payload)
updateContract(contractId, patch)
activateContract(contractId)
cancelContract(contractId, reason?)
replaceContractTerms(contractId, terms)
getLatestContractForResident(residentUserId)

createMoveInRequest(contractId, payload)
createMoveOutRequest(contractId, payload)
listMoveInRequests(buildingId, status?)
listMoveOutRequests(buildingId, status?)
approveMoveInRequest(requestId)
rejectMoveInRequest(requestId, reason?)
approveMoveOutRequest(requestId)
rejectMoveOutRequest(requestId, reason?)
executeMoveIn(contractId)
executeMoveOut(contractId)
```

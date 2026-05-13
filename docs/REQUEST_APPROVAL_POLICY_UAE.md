# Request Approval Policy (UAE Market, V1)

This is a product and operations policy recommendation for Towerdesk.

It is designed to make the maintenance request flow smooth, credible in the UAE market, and easy to present to investors.

It is not legal advice.

## Goal

Make maintenance requests feel operationally mature with one clear rule:

- emergencies move immediately
- small like-for-like repairs move fast
- material owner-cost decisions require owner approval

## Core Principle

Do not ask the owner to approve every maintenance request.

That creates friction and makes the system feel slow.

Ask for owner approval only when the work is:

- materially costly
- discretionary
- upgrade-like
- likely to be disputed later

## Recommended Default Policy (V1)

### Proceed Without Owner Approval

Management can proceed directly when:

- issue is emergency or habitability-related
- or estimated cost is `<= AED 1,000`
- and work is like-for-like repair
- and no structural or major system replacement is involved

### Request Owner Approval

Management should request owner approval when:

- estimated cost is `> AED 1,000`
- or work is an upgrade or alteration
- or work involves major replacement
- or the payer/responsibility may be disputed
- or the issue is non-emergency but commercially sensitive

### Override Owner Approval

Management override should be restricted to:

- emergency immediate override
- urgent expired-deadline override

That already aligns with the current backend model.

## Decision Matrix

Use this as the operating rulebook.

### Auto Proceed

- Light bulb, switch plate, minor consumable replacement
- Small plumbing fix
  - faucet washer
  - minor seal
  - small exposed fitting
- Small electrical fix
  - socket faceplate
  - breaker reset plus tiny replacement
- Small carpentry touch-up
- Minor lock/handle repair
- Cost at or below `AED 1,000`
- Like-for-like repair
- No owner policy exception

Recommended action:

- assign immediately

### Request Owner Approval

- Water heater replacement
- Major AC repair or compressor replacement
- Built-in appliance replacement in furnished unit
- Major plumbing works behind walls
- Electrical panel or major rewiring work
- Repeated issue now requiring bigger spend
- Any quote above `AED 1,000`
- Any visible finish upgrade or non-like-for-like replacement
- Any work where owner may ask “why was this done without my approval?”

Recommended action:

- request owner approval first

### Proceed Immediately And Notify Owner

- Full AC failure during extreme heat
- Water leak causing active damage
- Sewage backup
- Electrical hazard
- Fire/life-safety issue
- Security risk affecting unit safety/access

Recommended action:

- dispatch immediately
- notify owner
- record emergency reason

### Always Escalate

- Structural cracks
- façade/waterproofing concerns
- repeated hidden leak pattern
- major MEP replacement
- any job requiring authority permits or insurer coordination

Recommended action:

- send for owner approval unless emergency

## UAE-Oriented Practical Thresholds

These are operational defaults, not statutory thresholds.

- `AED 0 to 500`
  - management should proceed directly
- `AED 500 to 1,000`
  - management usually proceeds directly if clearly like-for-like
- `Above AED 1,000`
  - owner approval usually required
- `Any upgrade / alteration / non-like-for-like`
  - owner approval required regardless of amount
- `Any emergency / habitability issue`
  - proceed immediately regardless of amount, then notify

## Recommended Categories That Usually Need Approval

- HVAC replacement
- Water heater replacement
- Major plumbing
- Major electrical
- Appliance replacement
- Joinery replacement
- Waterproofing
- Structural / civil work
- Upgrade requests

## Recommended Categories That Usually Do Not Need Approval

- Minor plumbing
- Minor electrical
- Minor hardware
- Small consumables
- Small repairs under threshold
- Like-for-like corrective maintenance

## Target Management Flow (Policy-Driven)

If Towerdesk moves from advisory V1 to a backend-driven workflow, management should not start from policy questions.

Management should start from the next operational action.

The intended product shape is:

1. tenant submits a simple request
2. backend classifies the route
3. management sees one clear next action
4. backend re-evaluates when new facts arrive, especially estimate data

### Keep Tenant Intake Simple

Tenant-facing creation should ask only:

- what is the issue
- what category is it
- how urgent is it
- attach photos

Optional emergency signals:

- active leakage
- no power
- safety risk
- no cooling during extreme heat

Do not ask tenants:

- is this like-for-like
- is this a major replacement
- is responsibility disputed
- should owner approval be required

Those are internal ops/policy concepts.

### Separate Route From Workflow State

The backend should compute two different things:

1. route outcome
2. workflow queue

Suggested route outcomes:

- `DIRECT_ASSIGN`
- `EMERGENCY_DISPATCH`
- `NEEDS_ESTIMATE`
- `OWNER_APPROVAL_REQUIRED`

Suggested workflow queues:

- `NEW`
- `NEEDS_ESTIMATE`
- `AWAITING_OWNER`
- `READY_TO_ASSIGN`
- `ASSIGNED`
- `IN_PROGRESS`
- `OVERDUE`

This distinction matters:

- route outcome answers: `what should happen next?`
- workflow queue answers: `where should ops work this request now?`

### Management Queue Design

Management should work from segmented queues, not one flat request list.

Recommended queues:

- `New`
  - newly submitted requests not yet acted on
- `Needs Estimate`
  - requests waiting for price/scope before final routing
- `Awaiting Estimate`
  - estimate already requested from provider and execution remains blocked pending quote
- `Awaiting Owner`
  - approval requested and execution blocked
- `Ready to Assign`
  - cleared for dispatch to staff or provider
- `Assigned`
  - dispatched and waiting for execution start
- `In Progress`
  - execution started
- `Overdue`
  - SLA attention queue layered on top of open work

### Request Detail Screen

The management request detail should show:

- issue summary
- unit, building, resident
- photos and attachments
- current route badge
- current workflow queue badge
- short system explanation for why the route was chosen
- one primary CTA
- secondary exception actions only when relevant

Examples of explanation copy:

- `Minor like-for-like repair under threshold. Ready to assign.`
- `Likely cost-sensitive or unclear scope. Estimate required before dispatch.`
- `Emergency indicators detected. Dispatch immediately and notify owner.`
- `Owner approval required before execution due to policy threshold or scope.`

### Primary CTA By Queue

#### `NEW`

If backend route is `DIRECT_ASSIGN`:

- primary CTA: `Assign Staff`
- secondary CTA: `Assign Provider`

If backend route is `EMERGENCY_DISPATCH`:

- primary CTA: `Dispatch Now`
- secondary CTA: `Assign Staff`
- secondary CTA: `Assign Provider`

If backend route is `NEEDS_ESTIMATE`:

- primary CTA: `Get Estimate`

If backend route is `OWNER_APPROVAL_REQUIRED`:

- primary CTA: `Request Owner Approval`

#### `NEEDS_ESTIMATE`

Show:

- primary CTA: `Request / Upload Estimate`
- secondary CTA: `Assign Provider for Estimate Visit`
- secondary CTA: `Mark as Emergency` if privileged and justified

#### `AWAITING_ESTIMATE`

Show:

- primary CTA: `View Provider / Follow Up`
- secondary CTA: `Upload Estimate`
- secondary CTA: `Reassign Estimate Provider`
- stale requests should raise an internal reminder when the quote SLA expires

Hide or disable:

- normal assignment-to-execution actions

#### `AWAITING_OWNER`

Show:

- primary disabled state: `Waiting for Owner`
- secondary CTA: `Send Reminder`
- secondary CTA: `Override Approval` if allowed by policy and permissions

Hide or disable:

- assign staff
- assign provider
- status progression actions

#### `READY_TO_ASSIGN`

Show:

- primary CTA: `Assign Staff`
- secondary CTA: `Assign Provider`

If provider is already chosen but worker is not:

- secondary CTA: `Assign Provider Worker`

#### `ASSIGNED`

Show:

- primary CTA: `Start Work`
- secondary CTA: `Reassign`
- secondary CTA: `Add Comment`

#### `IN_PROGRESS`

Show:

- primary CTA: `Mark Completed`
- secondary CTA: `Add Comment`
- secondary CTA: `Upload Attachment`

#### `OVERDUE`

Show the same action as the underlying execution state, plus:

- overdue badge
- SLA warning
- escalation shortcut

### End-To-End Management Flow

#### 1. Tenant submits request

Tenant provides:

- category
- urgency
- description
- photos

Backend immediately computes initial route.

#### 2. Request lands in an ops queue

Examples:

- minor issue -> `READY_TO_ASSIGN`
- emergency signal -> `NEW` with emergency route, or direct emergency dispatch queue treatment
- unclear cost/scope -> `NEEDS_ESTIMATE`
- clearly major replacement -> `AWAITING_OWNER` after approval request is issued

#### 3. Management opens request

Management should see:

- what the system recommends
- why
- what the next button should be

Management should not need to decide policy from scratch in the common case.

#### 4. Management takes the next operational action

Usually this is one of:

- assign staff
- assign provider
- request estimate
- send owner approval request

#### 5. New facts arrive

Typical new facts:

- estimate amount
- provider assessment
- emergency confirmation
- owner approval decision

Backend re-runs policy and moves the request to the correct next queue.

#### 6. Execution proceeds

Once execution is unlocked:

- request is assigned
- work starts
- request moves to `IN_PROGRESS`
- request completes

### Estimate-Driven Re-Evaluation

This is the critical second-stage rule.

At tenant creation time, the system often does not know final cost or whether the work is truly major.

So the backend should behave like this:

- if clearly emergency -> dispatch immediately and notify owner
- if clearly minor and like-for-like -> allow direct assignment
- if cost/scope is unclear -> require estimate first
- after estimate arrives -> automatically decide whether owner approval is required

That means the normal management job becomes:

- assign
- or get estimate

Then the backend decides whether the owner must be brought in.

### Concrete Example Flows

#### Example A: Minor repair

- tenant submits `Light bulb out`
- backend routes to `DIRECT_ASSIGN`
- request appears in `Ready to Assign`
- management assigns staff
- request moves to `Assigned`

#### Example B: Emergency

- tenant submits `Water leak causing damage`
- backend routes to `EMERGENCY_DISPATCH`
- management sees `Dispatch Now`
- staff or provider is assigned immediately
- owner is notified
- request continues through execution without waiting

#### Example C: Unclear cost

- tenant submits `AC not cooling`
- backend routes to `NEEDS_ESTIMATE`
- management requests provider estimate
- estimate returns at `AED 650`
- backend re-routes to `READY_TO_ASSIGN`
- management assigns provider

#### Example D: Major replacement

- tenant submits `Replace water heater`
- backend routes to `NEEDS_ESTIMATE` or directly to approval-required path depending on confidence
- estimate returns at `AED 1,800`
- backend moves request to `AWAITING_OWNER`
- owner approves
- request moves to `READY_TO_ASSIGN`
- management assigns provider

## Suggested Automated Backend Transition Model

This is the clean target state:

- request created
  - backend computes initial route
- route = `DIRECT_ASSIGN`
  - queue -> `READY_TO_ASSIGN`
- route = `EMERGENCY_DISPATCH`
  - queue -> `READY_TO_ASSIGN` with emergency dispatch treatment, or dedicated emergency queue treatment
- route = `NEEDS_ESTIMATE`
  - queue -> `NEEDS_ESTIMATE`
- route = `OWNER_APPROVAL_REQUIRED`
  - backend creates or prepares approval request
  - queue -> `AWAITING_OWNER`
- owner approves
  - queue -> `READY_TO_ASSIGN`
- owner rejects
  - queue stays execution-blocked until revised estimate/request
- assigned
  - queue -> `ASSIGNED`
- work started
  - queue -> `IN_PROGRESS`
- overdue timer breached
  - request also appears in `OVERDUE`

## How Frontend Should Behave Right Now

The current backend does not yet have a full automatic policy engine.

So in V1, the frontend should implement a guided management decision flow using the existing endpoints.

## Current Backend Reality

The backend currently separates:

1. mark approval as required
2. send the approval request

Endpoints:

- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/require`
- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/request`
- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/resend`
- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/override`

Smooth frontend behavior:

- do not expose `require` and `request` as separate user-facing concepts
- show one primary CTA:
  - `Request Owner Approval`
- on click, frontend should:
  1. call `require`
  2. then call `request`

If either fails, surface a meaningful error and keep the request in place.

## Recommended Request Detail Action Logic

### If approval is not required yet

Show:

- `Assign Staff`
- `Assign Provider`
- `Request Owner Approval`

If estimated amount or category meets the recommended approval rule:

- make `Request Owner Approval` the primary CTA
- keep assignment actions secondary or visually warned

### If approval is pending

Show:

- primary disabled state: `Waiting for Owner Approval`
- secondary action: `Send Reminder`
- secondary action if permitted: `Override Approval`

Hide or disable:

- assign staff
- assign provider
- status progression actions

### If approval is approved

Show:

- primary CTA: `Assign Staff`
- secondary CTA: `Assign Provider`

### If approval is rejected

Show:

- blocked badge: `Rejected by Owner`
- secondary CTA: `Review / Revise Estimate`
- secondary CTA: `Request Again`
- secondary CTA if permitted: `Override Approval`

## Recommended Management UI Copy

### Primary Button

- `Request Owner Approval`

Not:

- `Require approval`
- `Mark pending`
- `Send owner workflow`

### Confirmation Modal

Title:

- `Request owner approval?`

Body:

- `This request exceeds the direct-dispatch threshold or involves work that should be approved by the owner before assignment.`

Fields:

- required reason
- estimated amount
- estimated currency
- optional deadline

Primary action:

- `Send Approval Request`

### Pending State Badge

- `Waiting for owner approval`

### Approved State Badge

- `Approved for execution`

### Rejected State Badge

- `Owner rejected`

### Emergency State Copy

- `Emergency issue. Dispatch immediately and notify owner.`

## Recommended Owner Mobile Copy

Title:

- `Approval needed for maintenance work`

Show:

- unit
- issue title
- reason approval is required
- estimated amount
- building / org name

Primary actions:

- `Approve Work`
- `Reject`

Optional note field:

- `Add a note`

## Recommended Queue Structure

To make the system feel operationally strong, split the management queue into:

- `New`
- `Awaiting Owner`
- `Ready to Assign`
- `Assigned`
- `In Progress`
- `Overdue`

This is much better than one giant request list.

## Recommended Investor Demo Flow

This is the clean story to show:

1. Tenant creates request
2. Request lands in `New`
3. Management opens it
4. UI recommends `Request Owner Approval`
5. Owner approves from phone
6. Request moves to `Ready to Assign`
7. Management assigns provider
8. Provider marks `In Progress`
9. Tenant sees live status

That flow sells better than “we have endpoints.”

## Suggested V1 Frontend Rule Engine

Frontend can implement this now as a recommendation engine.

Inputs:

- category
- estimated amount
- whether issue is emergency
- whether work is like-for-like
- whether work is replacement/upgrade

Recommendation:

- `Proceed now`
- `Request owner approval`
- `Proceed immediately and notify owner`

Example logic:

```ts
if (isEmergency) return 'PROCEED_AND_NOTIFY';
if (isUpgrade) return 'REQUEST_OWNER_APPROVAL';
if (isMajorReplacement) return 'REQUEST_OWNER_APPROVAL';
if ((estimatedAmount ?? 0) > 1000) return 'REQUEST_OWNER_APPROVAL';
return 'PROCEED_NOW';
```

This does not replace backend enforcement yet.

It gives management a fast default path today.

## Suggested Backend Enhancements Later

These are not required to improve the flow immediately, but they should be the next step.

- server-side approval policy engine
- server-side route classification at request creation
- queue computation that includes `NEEDS_ESTIMATE`
- estimate submission and estimate review workflow
- per-owner approval thresholds
- per-unit or per-building policy
- request category policy mapping
- emergency flag in request workflow
- automatic reminders after pending duration
- auto-approve low-value like-for-like jobs

## What To Ship Now

If the goal is smoothness right now, ship this:

- one-button owner approval request flow
- visible approval badges in request detail
- queue segmentation
- estimated amount field in triage UI
- category-driven recommendation banner
- emergency path that bypasses owner approval

## Current API Mapping For This Future Flow

Until the backend grows the full automatic engine, the frontend can map the target flow onto current endpoints like this:

- `Assign Staff`
  - `POST /org/buildings/:buildingId/requests/:requestId/assign`
- `Assign Provider`
  - `POST /org/buildings/:buildingId/requests/:requestId/assign-provider`
- `Assign Provider Worker`
  - `POST /org/buildings/:buildingId/requests/:requestId/assign-provider-worker`
- `Request Owner Approval`
  - prefer one-button flow with `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/request-now`
  - or call `require` then `request`
- `Send Reminder`
  - `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/resend`
- `Override Approval`
  - `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/override`
- `Save Triage / Estimate Facts`
  - `POST /org/buildings/:buildingId/requests/:requestId/policy-triage`

Important limitation of the current backend:

- `NEEDS_ESTIMATE` is not yet a first-class queue value
- estimate handling is still represented through triage fields like `estimatedAmount`
- the route is still recommendation-oriented, not fully enforced at request creation

So the current product can approximate the management flow now, while the backend evolves toward the cleaner policy-driven version above.

## Simple Operating Rule For Management

Tell management staff:

- `Emergency? Dispatch now and notify owner.`
- `Minor like-for-like repair under AED 1,000? Proceed.`
- `Anything larger, upgrade-like, or debatable? Request owner approval first.`

If the product follows that rule consistently, the flow will feel much more mature immediately.

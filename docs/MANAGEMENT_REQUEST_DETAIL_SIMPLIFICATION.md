# Management Request Detail Simplification Spec

Use this file as the source of truth for simplifying the management portal
maintenance request detail screen.

This does not change backend behavior. It changes how much of that behavior is
exposed at once.

## Problem

The current management request detail is trying to be:

- an operator workflow screen
- a policy debugger
- an assignment console
- an approval console
- an estimate console
- an audit screen

all at the same time.

That is too much for daily operations.

The backend already automates route and queue decisions. The UI should now
reflect that by emphasizing:

- what the system decided
- why it decided it
- what the next action is
- what exceptions are available only when needed

## Product Principle

The request detail screen should answer these questions in this order:

1. What is this request?
2. What state is it in right now?
3. Why is it in that state?
4. What should management do next?
5. What supporting context or exceptions are available?

If the screen shows more than that by default, it is leaking internal system
shape into the operator workflow.

## Non-Goals

- Do not remove backend flexibility.
- Do not remove audit visibility.
- Do not remove override paths.
- Do not remove estimate or owner approval workflows.

Instead:

- move low-frequency controls out of the main path
- collapse metadata by default
- show only the action that matches the current queue/route

## Screen Model

The request detail should be split into three layers:

### Layer 1: Always Visible

This is the operational layer.

- title
- building
- unit
- created time
- status badge
- queue badge
- owner approval badge when present
- estimate badge when present
- overdue badge when applicable
- one short system explanation
- one primary CTA
- at most 2 to 4 secondary actions
- comments preview / latest activity
- attachments preview

### Layer 2: Collapsed Sections

These are useful, but not needed at first glance.

- full description
- assignment info
- estimate details
- owner approval details
- policy details
- workflow snapshot
- full attachment list

These should render as accordions or secondary cards collapsed by default.

### Layer 3: Advanced Actions

These should not live in the main body as normal controls.

- override approval
- manual provider worker user ID input
- reassign estimate provider
- raw triage fact editing
- unassign provider
- cancel request
- resend / reminder edge-case tools

These should live under an `Advanced Actions` drawer or menu.

## Target Layout

### 1. Header Card

Show:

- queue badge
- status badge
- owner approval badge if relevant
- estimate badge if relevant
- overdue badge if relevant
- request title
- building name
- unit label
- created timestamp

Do not show:

- multiple stacked workflow panels above the fold
- raw policy fields above the fold

### 2. System Decision Card

This card replaces a large amount of visible policy noise.

Show:

- route label
- short recommendation label
- one-sentence summary
- blocking banner only when action is blocked

Examples:

- `Direct assign recommended. Minor like-for-like repair under threshold.`
- `Estimate required before dispatch due to unclear scope or likely cost.`
- `Owner approval required before execution due to policy threshold or scope.`
- `Emergency dispatch recommended. Proceed immediately and notify owner.`

If execution is blocked:

- show one banner
- explain the block in plain language
- keep the blocking reason short

Do not show the full policy object by default.

### 3. Action Bar

This is the most important part of the screen.

Rules:

- show one primary CTA only
- show only contextually valid secondary actions
- do not render every possible action as a button

Primary CTA should be queue-driven.

Secondary actions should be exception-oriented, not a second main workflow.

### 4. Activity Section

This should be visible without extra digging.

Show:

- attachments preview
- comment thread
- add comment
- upload attachment

Reason:

- comments and attachments are the real operational collaboration layer
- they matter more day-to-day than raw policy metadata

### 5. Collapsed Detail Sections

Below the activity section, use collapsed sections for:

- Assignment
- Estimate Details
- Owner Approval Details
- Policy Details
- Workflow Snapshot

These should support audits and edge cases without dominating the screen.

## CTA Model

The screen should not make management choose from a control panel.
It should point them to the next obvious step.

### Queue: `NEW`

If route is `DIRECT_ASSIGN`:

- primary: `Assign Staff`
- secondary: `Assign Provider`

If route is `EMERGENCY_DISPATCH`:

- primary: `Dispatch Now`
- secondary: `Assign Staff`
- secondary: `Assign Provider`

If route is `NEEDS_ESTIMATE`:

- primary: `Get Estimate`
- secondary: `Assign Provider For Estimate`

If route is `OWNER_APPROVAL_REQUIRED`:

- primary: `Request Owner Approval`
- secondary: `Edit Triage`

### Queue: `AWAITING_ESTIMATE`

- primary: `Follow Up Estimate`
- secondary: `Upload Estimate`
- secondary: `Reassign Estimate Provider`
- secondary: `Add Comment`

Do not show dispatch actions here.

### Queue: `AWAITING_OWNER`

- primary: `Waiting for Owner`
- secondary: `Send Reminder`
- secondary: `Override Approval`

The primary CTA can be non-destructive and disabled or informational.

Do not show execution actions here.

### Queue: `READY_TO_ASSIGN`

- primary: `Assign Staff`
- secondary: `Assign Provider`

If a provider is already selected and assignment is the likely next action:

- secondary: `Assign Provider Worker`

### Queue: `ASSIGNED`

If internal staff path:

- primary: `Start Work`
- secondary: `Reassign Staff`

If provider path:

- primary: `Start Work`
- secondary: `Assign Provider Worker`

Do not show estimate and owner approval controls unless the request is clearly
back in a state that needs them.

### Queue: `IN_PROGRESS`

- primary: `Mark Completed`
- secondary: `Add Comment`
- secondary: `Upload Attachment`

### Queue: `COMPLETED`

- no primary workflow CTA
- secondary: view-only or audit-only actions as needed

### Queue: `CANCELED`

- no primary workflow CTA
- read-only state

## What Stays Visible vs Moves

### Keep Visible

- badges
- short explanation
- one primary CTA
- a few secondary actions
- comments
- attachment preview
- blocking banners

### Move Into Collapsed Sections

- full estimate metadata
- full owner approval metadata
- policy snapshot internals
- workflow snapshot internals
- assignment metadata that is not actionable right now

### Move Into Advanced Actions

- manual provider worker user ID input
- override source selector
- override reason textarea
- approval request reason textarea
- raw triage fact checkboxes
- unassign provider
- cancel request

These are valid capabilities, but they should not sit in the operator's face.

## Remove From Main Screen

The following should not appear in the default open state of the screen:

- manual provider worker user ID input
- editable triage checkboxes
- full policy field dump
- full workflow snapshot block
- full estimate metadata block
- full owner approval metadata block
- multiple assignment selectors at once unless the current action is assignment

If management is not currently assigning, do not show all three of:

- staff selector
- provider selector
- provider worker selector

Show assignment controls only when the current CTA is assignment-related or when
the user explicitly opens the Assignment section.

## Assignment UX Rule

Assignment is a task, not permanent page furniture.

Default behavior:

- show current assignee summary only
- show provider summary only
- show provider worker summary only

When the user taps an assignment CTA:

- open the relevant picker flow
- do not keep all selectors expanded in the base screen

## Policy UX Rule

Policy should explain workflow, not force operators to think in policy terms
first.

Default behavior:

- show route
- show recommendation
- show summary

Advanced behavior:

- allow editing triage inputs in a dedicated `Edit Triage` flow or collapsed
  section
- do not show raw triage checkboxes by default on every request

## Estimate UX Rule

Estimate handling should be visible only when estimate workflow is active or
estimate data already exists.

Default visible summary:

- estimate badge
- estimate state
- due date if estimate is outstanding
- submitted amount if estimate exists

Collapsed details:

- requested at
- requested by
- reminder sent at
- submitted at
- submitted by
- currency and amount internals

## Owner Approval UX Rule

Owner approval should feel like a blocking workflow, not a metadata panel.

Default visible summary:

- owner approval badge
- one-line reason
- deadline if pending
- blocking banner if execution is locked

Visible actions when pending:

- `Send Reminder`
- `Override Approval` only if policy allows and the user explicitly chooses the
  exception path

Collapsed details:

- requested by
- decided at
- decision source
- override source
- override reason
- full reason history

## Comments And Attachments

These deserve more weight than they usually get.

Request detail should prioritize:

- recent discussion
- evidence photos / files
- easy posting of new comments
- easy upload of new attachments

This is the collaborative working area.

It is more important operationally than showing every policy field.

## Permissions And Backend Alignment

This simplification does not require backend endpoint changes.

It aligns with the existing backend split:

- queue and route are already computed
- owner approval already blocks execution
- estimate workflow already has explicit request and submit endpoints
- provider assignment and provider-worker assignment are separate actions
- policy triage already exists as a dedicated endpoint

Relevant backend docs:

- [REQUEST_APPROVAL_POLICY_UAE.md](./REQUEST_APPROVAL_POLICY_UAE.md)
- [API.md](./API.md)
- [FRONTEND_VENDOR_SERVICE_PROVIDER_APIS_GUIDE.md](./FRONTEND_VENDOR_SERVICE_PROVIDER_APIS_GUIDE.md)

## Implementation Rules For Frontend Agent

- Start from the queue and route, not from all possible controls.
- Render one primary CTA.
- Render only relevant secondary actions.
- Collapse metadata sections by default.
- Hide advanced/manual controls behind an explicit affordance.
- Prefer plain-language explanations over internal field names.
- Keep comments and attachments easy to access.
- Treat assignment as a modal/task flow, not a permanently expanded panel.

## Final Product Standard

If an operator opens a request and cannot tell the next action within a few
seconds, the screen is still too complicated.

If the screen looks like an admin console instead of an operations workflow, it
is still too complicated.

If the system already knows the route, queue, and block reason, the UI should
say that directly instead of making the operator infer it from raw metadata.

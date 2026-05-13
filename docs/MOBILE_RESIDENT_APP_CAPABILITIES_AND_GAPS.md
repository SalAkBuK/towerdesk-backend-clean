# Resident Mobile App Capabilities And Gaps

This document summarizes what the backend currently provides to the resident mobile app, what that means in product terms, and what is still missing compared to a serious production-grade resident app.

It is intentionally blunt. The goal is to describe the real backend-backed resident surface, not an aspirational pitch.

## 1. Executive Summary

The resident mobile app is currently an operations and tenancy app.

It already supports:

- authentication and password recovery
- resident self-profile and avatar
- active occupancy, building, and unit context
- lease and contract visibility
- move-in and move-out request workflows
- maintenance requests
- visitor preregistration
- private messaging with management and current owner
- notifications, push registration, and realtime notification delivery
- read-only active parking allocation

It does not yet support:

- rent payments or billing
- amenity booking
- package management
- resident vehicle management
- a resident-facing announcement center
- household management
- digital move checklists
- community or lifestyle features

The honest product position is this:

- if the target is a resident operations app, the backend is already useful
- if the target is a full resident super-app, the backend is still missing major domains

## 2. Current Resident App Feature Matrix

| Feature Area | What The Resident Can Do | Main Endpoints | Important Caveats |
| --- | --- | --- | --- |
| Authentication | Log in, refresh session, log out, change password, reset forgotten password | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password` | Public registration exists technically, but production defaults it off. |
| Resident Home Context | See their own account, active building, unit, and occupancy state | `GET /resident/me` | If the resident has no active occupancy, this returns successfully with `occupancy = null`. That is a valid state. |
| Profile Management | Update extended resident profile and upload avatar | `PUT /resident/me/profile`, `POST /resident/me/avatar` | Avatar upload is image-only and capped at 5 MB. |
| Lease Overview | View current active lease | `GET /resident/lease/active` | Returns `null` when there is no active lease. |
| Lease Documents | View active lease documents | `GET /resident/lease/active/documents` | Read-only from this endpoint. Returns `[]` when no active lease exists. |
| Contract History | View all contracts, latest contract, and contract detail | `GET /resident/contracts`, `GET /resident/contracts/latest`, `GET /resident/contracts/:contractId` | This is stronger than a simple lease viewer. It exposes real contract lifecycle visibility. |
| Contract Document Upload | Upload signed tenancy contract documents | `POST /resident/contracts/:contractId/documents/upload-url`, `POST /resident/contracts/:contractId/documents` | This is not a generic document vault. Resident uploads are restricted to signed tenancy contract documents. |
| Move-In / Move-Out Requests | Create move-in and move-out requests and view request history | `POST /resident/contracts/:contractId/move-in-requests`, `POST /resident/contracts/:contractId/move-out-requests`, `GET /resident/contracts/:contractId/move-in-requests`, `GET /resident/contracts/:contractId/move-out-requests` | Backend enforces state hard. Duplicate pending or approved requests are blocked. Move-out requires active occupancy. |
| Maintenance Requests | Create requests, list own requests, view detail, edit open requests, cancel, and comment | `POST /resident/requests`, `GET /resident/requests`, `GET /resident/requests/:requestId`, `PATCH /resident/requests/:requestId`, `POST /resident/requests/:requestId/cancel`, `POST /resident/requests/:requestId/comments`, `GET /resident/requests/:requestId/comments` | Strong resident feature. Emergency flags and emergency signals are supported. Editing is only allowed while the request is open. Resident request responses now include `requestTenancyContext` so the mobile app can trust backend tenancy-cycle classification instead of inventing it locally. |
| Visitor Pre-Registration | Register visitors, list them, view one, edit expected visitors, and cancel expected visitors | `POST /resident/visitors`, `GET /resident/visitors`, `GET /resident/visitors/:visitorId`, `PATCH /resident/visitors/:visitorId`, `POST /resident/visitors/:visitorId/cancel` | Residents cannot mark visitors as arrived or completed. Staff controls those states. Visibility is unit-based, not person-based. |
| Messaging Setup | View allowed management contacts and create conversations with management or current owner | `GET /resident/messages/management-contacts`, `POST /resident/messages/management`, `POST /resident/messages/owner` | Residents cannot message arbitrary users. Management targets are limited to the active building. Owner target is only the current owner of the active unit. |
| Messaging Inbox | List conversations, view conversation detail, send replies, mark conversations as read, and get unread count | `GET /org/conversations`, `GET /org/conversations/unread-count`, `GET /org/conversations/:id`, `POST /org/conversations/:id/messages`, `POST /org/conversations/:id/read` | Messaging is participant-only private messaging, not a community chat system. |
| Notifications | List notifications, get unread count, mark read, mark all read, dismiss, and undismiss | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `POST /notifications/:id/dismiss`, `POST /notifications/:id/undismiss` | Notification types include maintenance, visitor arrival, move requests, broadcasts, and messaging events. |
| Push Notifications | Register or unregister device push token | `POST /notifications/push-devices/register`, `POST /notifications/push-devices/unregister` | Push exists, but delivery is synchronous today. |
| Realtime Notifications | Receive live notification events over Socket.IO | Socket namespace `/notifications` | REST remains the source of truth. Client should refetch on reconnect. |
| Parking | View current active parking allocation | `GET /resident/parking/active-allocation` | Read-only. No resident parking management or resident vehicle CRUD exists. |

## 3. What Can Be Claimed Honestly

The resident mobile app currently supports:

- account access and password recovery
- resident self-profile and avatar
- building, unit, and occupancy context
- lease and contract viewing
- signed contract document upload
- move-in and move-out request workflows
- resident maintenance request lifecycle
- visitor preregistration
- private messaging with management and the current owner
- in-app notifications, push notifications, and realtime notifications
- read-only active parking allocation

## 4. What Cannot Be Claimed Honestly

The current backend does not support the following as resident-app features:

- rent payments
- invoices or billing center
- autopay, receipts, or statements
- amenity booking
- resident vehicle management
- package handling
- community feed or social features
- resident-facing announcement center as a dedicated screen
- generic support or complaint module separate from maintenance

## 5. Product Reality

The resident mobile app is currently a property-operations and tenancy app.

It is good at:

- helping a resident understand where they live in the system
- handling resident service interactions
- supporting lease and contract workflows
- supporting basic communication and notifications

It is not yet a complete digital living platform.

## 6. Gap Analysis Against A Serious Production Resident App

### A. Payments and billing gap

This is the biggest commercial gap.

Missing today:

- rent payment workflow
- invoice generation and presentation
- resident ledger
- autopay
- receipts
- deposit balance visibility
- fines and penalty handling
- statements and transaction history

Important nuance:

- lease and contract records contain rent-related fields, but those are not the same thing as a resident billing product

### B. Booking and convenience gap

Missing today:

- amenity booking
- facility reservations
- service scheduling for resident-facing conveniences
- guest suite or clubhouse booking
- recurring booking or reservation rules

This means the app currently supports operations, not convenience services.

### C. Package and delivery gap

Missing today:

- package inbox
- package arrival and pickup workflow
- locker or front-desk package handling
- courier handoff tracking
- package-specific notifications

For many buildings, this is a core resident expectation.

### D. Parking and vehicle gap

Resident parking is currently almost read-only.

What exists:

- current active parking allocation read

What is missing:

- resident vehicle create, update, and delete
- guest parking permits
- secondary slot requests
- slot swap or transfer requests
- violation or towing notices
- EV charging booking or billing

### E. Announcement and broadcast gap

Residents can receive broadcast notifications, but there is no first-class resident-facing announcements product.

Missing today:

- announcement list or archive
- dedicated resident broadcast feed
- read tracking or acknowledgment workflow
- attachment or document distribution through a resident announcement center

This matters because push notifications alone are not a durable resident communications surface.

### F. Move workflow gap

The backend does support move-in and move-out requests, but the broader resident move experience is incomplete.

Missing today:

- digital move-in checklist
- digital move-out checklist
- onboarding and handover tasks
- inspection and handover confirmations
- utility setup tasks
- key collection workflow
- required document checklist management

Current state:

- move requests exist
- complete move orchestration product does not

### G. Maintenance maturity gap

Maintenance is one of the stronger resident-facing domains, but it is still missing features expected in a mature resident experience.

Missing today:

- appointment scheduling with time slots
- technician ETA or live visit status
- resident reschedule flow
- post-job rating
- satisfaction survey
- resident-side dispute flow
- optional work approval flow for residents
- self-help troubleshooting content

Current state:

- residents can create, track, update, cancel, and comment on requests
- beyond that, the experience remains fairly operational and linear

### H. Communication maturity gap

Messaging exists, but it is narrow.

What exists:

- resident-to-management conversation creation
- resident-to-owner conversation creation
- conversation inbox, replies, unread count, and read state

What is missing:

- message attachments in the exposed resident chat surface
- request-linked conversation threads
- communication preference center
- notification category preferences
- quiet hours or per-channel opt-in controls
- escalation and routing transparency

Current state:

- messaging is useful
- messaging is not a full communication platform

### I. Household and identity gap

The resident model is centered on the individual authenticated user plus occupancy context.

Missing today:

- household management
- co-occupant or family management
- dependent or domestic staff delegation
- delegated access or spouse access
- richer resident identity verification workflow
- resident-facing key, card, or gate credential management

Current state:

- the app is resident-centric, not household-centric

### J. Visitor and access-control gap

Visitor preregistration exists and is useful, but it remains basic.

Missing today:

- QR guest pass or barcode guest pass
- one-time PIN or access code flow
- recurring guest model
- long-term domestic staff access model
- visit approval interaction with security
- smart-entry or gate-control integration

Current state:

- residents can preregister and cancel expected visitors
- staff still owns the operational access side

### K. Documents and compliance gap

Document handling exists only in narrow slices.

What exists:

- signed contract upload

What is missing:

- resident document vault
- broader compliance document uploads
- document expiry reminders
- e-signature workflow
- resident form center
- NOC and permit request workflow

Current state:

- contract document upload exists
- general resident document management does not

### L. Community and lifestyle gap

There is no real community or lifestyle layer.

Missing today:

- resident feed
- events
- surveys and polls
- classifieds
- neighborhood guide
- partner offers
- local service directory
- pet, family, or lifestyle features

Current state:

- the app is utility-driven, not engagement-driven

## 7. Operational Risks And Product Constraints

Several resident flows depend on active occupancy.

That creates real product constraints:

- a resident can log in successfully but still have `occupancy = null`
- visitor flow depends on active occupancy
- maintenance intake depends on active occupancy
- resident-to-management messaging creation depends on active occupancy
- resident-to-owner messaging depends on active occupancy and active owner access on the unit
- resident parking read can legitimately return `null`

These are valid states, but naive client logic will misread them as broken states.

Other operational constraints:

- push delivery is synchronous today
- broadcast fan-out is synchronous today
- messaging, notifications, and request comments are separate systems rather than one unified resident activity timeline

## 8. Brutally Honest Product Assessment

If the product goal is a serious resident operations app, the backend is already credible.

If the product goal is a competitive resident super-app, the backend is not close yet.

That is not because the current system is weak. It is because the current resident scope is concentrated in:

- tenancy
- operations
- requests
- notifications
- private messaging

It is still missing major convenience, commerce, and engagement domains.

## 9. Recommended Priority Order

Recommended priority based on commercial impact and product completeness:

1. Payments, billing, receipts, and ledger
2. Resident vehicle management and better parking workflows
3. Resident announcement center and document vault
4. Maintenance scheduling, ETA, and ratings
5. Move-in and move-out checklist workflows
6. Amenity booking and package management
7. Communication preferences and unified resident activity feed
8. Community and lifestyle features after the operational core is hardened

## 10. Implementation References

Primary resident-facing implementation surfaces:

- resident self-profile: `src/modules/residents/resident-profile.controller.ts`
- resident maintenance requests: `src/modules/maintenance-requests/resident-requests.controller.ts`
- resident visitors: `src/modules/visitors/resident-visitors.controller.ts`
- resident contracts and move requests: `src/modules/leases/resident-contract.controller.ts`
- resident active lease: `src/modules/leases/resident-lease.controller.ts`
- resident parking read: `src/modules/parking/resident-parking.controller.ts`
- resident messaging entry points: `src/modules/messaging/resident-messaging.controller.ts`
- shared conversation inbox: `src/modules/messaging/messaging.controller.ts`
- notifications and push-device handling: `src/modules/notifications/notifications.controller.ts`
- resident baseline permissions: `src/modules/access-control/resident-baseline-permissions.ts`


# Towerdesk Backend: Investor Technical Overview

Last updated: March 31, 2026

## Purpose

Towerdesk's backend is the operational core of the platform. It supports multi-tenant property management workflows for organizations managing buildings, units, residents, leases, maintenance, parking, visitors, messaging, and notifications from a single service layer.

This document is intended for investor and stakeholder review. It explains the platform's technical design, security posture, and product-readiness at a level that demonstrates execution quality without exposing unnecessary internal implementation detail.

## Executive Summary

The current backend is a modular TypeScript/NestJS platform backed by PostgreSQL and Prisma ORM. It is structured as a multi-tenant system, with tenant isolation centered on the organization (`Org`) model and enforced across API authorization, database access patterns, and role-based access control.

The platform already supports a broad set of operational workflows commonly required in residential and mixed-use property operations:

- Organization and admin provisioning
- Building, unit, and owner management
- Resident onboarding and occupancy tracking
- Lease and contract lifecycle management
- Maintenance request workflows
- Parking and vehicle allocation
- Visitor management
- In-app messaging and broadcast communication
- Realtime and push notification delivery

This gives Towerdesk a backend foundation that is materially beyond prototype stage. The codebase reflects production-oriented design choices, including authentication, tenant scoping, granular permissions, API validation, operational logging, rate limiting, migration-based schema management, and automated end-to-end test coverage.

## Architecture Overview

### Application layer

The backend is built with NestJS and organized into feature modules. Each module typically follows a controller-service-repository structure:

- Controllers expose HTTP endpoints
- Services contain business logic and orchestration
- Repositories handle database access through Prisma
- DTOs validate and shape request/response payloads

This structure makes the system easier to extend without tightly coupling unrelated domains. Major active modules include:

- Authentication and users
- Access control and platform administration
- Buildings, units, unit types, and owners
- Building assignments and occupancies
- Residents and resident profiles
- Leases and contract-related workflows
- Maintenance requests
- Parking
- Visitors
- Messaging and broadcasts
- Notifications and push devices
- Organization profile and health monitoring

### Data layer

The primary database is PostgreSQL. Prisma ORM is used as the schema and query layer, with migration files checked into source control. This provides:

- Versioned schema evolution
- Type-safe data access in the application layer
- Clear domain modeling for core entities

Core entities include organizations, users, buildings, units, occupancies, leases, maintenance requests, notifications, conversations, messages, parking allocations, visitors, and access-control roles/permissions.

### Realtime layer

Realtime notification delivery is implemented with Socket.IO under a dedicated `/notifications` namespace. REST remains the system of record, while websocket events provide immediate UI updates for operational workflows such as:

- New notifications
- Read and read-all state changes
- Dismiss and undismiss actions

This hybrid model is pragmatic for production use because it preserves consistency through REST while enabling responsive user experiences.

## Multi-Tenant Platform Design

Towerdesk is architected as a multi-tenant platform. The `Org` model represents the tenant boundary, and downstream records such as buildings, users, notifications, leases, and operational records are associated with an organization.

This design has direct commercial value:

- Multiple property organizations can be onboarded on shared infrastructure
- Data is logically isolated by tenant
- Administrative workflows can be managed per organization
- Platform-level administration can coexist with organization-level operations

Within each tenant, the system supports both organization-wide access and building-scoped access patterns. This is important for real estate operations where a central office, site managers, staff, and residents all require different visibility and permissions.

## Security and Access Control

Security has been designed into the core request lifecycle rather than added as a thin outer layer.

### Authentication

The platform uses JWT-based authentication with separate access and refresh token flows. Refresh tokens are stored as hashes rather than plain values, and password credentials are protected using Argon2 hashing.

### Authorization

Authorization is role- and permission-driven. The backend supports:

- System and tenant roles
- Fine-grained permission keys
- Per-user permission overrides
- Organization-scoped access enforcement
- Building-scoped access enforcement where operationally relevant

This is an important maturity signal because property operations rarely fit a simple "admin versus user" model. Towerdesk already supports more realistic access patterns for org admins, building admins, managers, staff, and residents.

### Request protection

The application also includes production-oriented request controls:

- Global DTO validation for incoming payloads
- Rate limiting via NestJS throttling
- Security headers via `helmet`
- Structured exception handling
- Config-driven environment validation at startup

## Product Capability Depth

The backend schema and module set indicate that Towerdesk is designed to manage operational workflows end to end, not just maintain a directory of buildings and residents.

Examples of workflow depth already represented in the platform include:

- Lease records with financial, compliance, and move-related fields
- Move-in and move-out request workflows
- Lease document storage metadata and activity history
- Parking slots, allocations, and vehicle associations
- Resident profile enrichment and invitation flows
- Maintenance ticket assignment, comments, attachments, and lifecycle transitions
- Visitor registration and arrival tracking
- Messaging conversations and broadcast communication
- Push device registration for mobile/web notification delivery

From an investor perspective, this matters because it suggests the product can support daily operational usage across multiple departments and user types, increasing switching costs and platform stickiness.

## Observability and Operational Readiness

The current backend includes several features associated with production-minded systems:

- Structured application logging
- Request-level metrics collection
- Global request/response interception
- Swagger documentation generation at `/docs`
- Health endpoint support
- Configurable HTTP server timeout behavior
- Optional queue and storage integrations

These capabilities reduce operational friction as the platform moves from controlled deployments toward broader commercial usage.

## Testing and Delivery Discipline

The repository includes automated Jest coverage across business-critical flows. As of March 31, 2026, the codebase contains 27 test specification files, including end-to-end coverage for:

- Authentication-adjacent user provisioning flows
- Building and unit management
- Residents and occupancies
- Maintenance requests
- Notifications and realtime notifications
- Messaging
- Parking
- Leases and contract workflows
- Visitors
- Access-control and RBAC enforcement

In addition to tests, the backend uses migration-based database changes and a defined seed process for permissions and default role behavior. This is a meaningful sign of engineering discipline because it reduces manual deployment risk and supports repeatable environment setup.

## Scalability View

The current architecture is appropriate for a growing SaaS property operations platform.

Reasons this foundation is scalable:

- Modular service boundaries reduce rewrite pressure as features expand
- PostgreSQL is well-suited for transactional operational workloads
- Prisma provides a maintainable schema evolution path
- Multi-tenant modeling supports portfolio expansion across organizations
- Socket.IO enables realtime user experience improvements without redesigning the core API
- Optional queue and storage modules provide a path for background jobs and file-heavy workflows

This does not mean the platform is infinitely scalable without future work. As usage grows, likely next-stage investments would include deeper background processing, broader observability, infrastructure automation, and horizontal deployment tuning for realtime traffic. The important point is that the present backend does not need a foundational rewrite to support those next steps.

## Why This Matters Commercially

From a technical diligence perspective, the backend demonstrates four things:

1. Towerdesk has already invested in a real systems foundation, not just UI-level prototyping.
2. The platform supports complex operational workflows that are hard to replicate quickly.
3. Security and access control are aligned with real-world property management needs.
4. The engineering structure is credible for continued feature expansion, tenant growth, and product hardening.

## Suggested Use in Investor Materials

This document works best as a technical appendix or supporting diligence note alongside a product deck. It can be paired with:

- A product capability summary
- Screenshots of operator and resident experiences
- A roadmap showing upcoming commercial and platform milestones
- Customer or pilot traction metrics

If needed, this can also be converted into a shorter 1-page architecture brief or a more formal technical due diligence pack for later-stage investor conversations.

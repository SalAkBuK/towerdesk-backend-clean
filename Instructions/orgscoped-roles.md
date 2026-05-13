Goal

Make roles and role-permission mappings org-scoped, so each organization has fully isolated roles and settings. Changes in one org must never affect another org.

Current State

Permission is global (permission keys like units.create, owners.read)

Role is currently global (no orgId)

Role-permission mappings are global

Users can belong to multiple orgs

RBAC is enforced via permission keys at runtime

Org scoping already exists elsewhere in the system (orgId is available in auth context)

Required Behavior

Each org has its own independent roles

Role keys (e.g. manager, admin) may repeat across orgs but must be unique within an org

Editing a role’s permissions must only affect that org

Permission keys remain global and unchanged

Minimal disruption to existing RBAC logic

Tasks

Update Prisma schema:

Add orgId to Role

Enforce @@unique([orgId, key])

Ensure role-permission relations reference org-scoped roles

Update queries/services so:

Roles are always resolved by (orgId, roleId)

Permission resolution is org-aware

Seed logic:

On org creation, create default roles for that org

Attach default permissions to those roles

Migration strategy:

Convert existing global roles into per-org roles

Preserve existing user access where possible

Safety:

Prevent cross-org role leakage

Enforce orgId checks consistently

Non-Goals

Do NOT change permission keys

Do NOT introduce global mutable roles

Do NOT add unnecessary abstraction layers

Output Expectations

Prisma schema diff

Migration approach (high-level or SQL/Prisma migrate)

Notes on RBAC resolution changes

Any edge cases or pitfalls to watch for
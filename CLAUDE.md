# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Towerdesk Backend is a NestJS + TypeScript + Prisma backend for multi-tenant property management. It handles buildings, units, occupancies, maintenance requests, notifications, and parking management with sophisticated role-based access control.

## Development Commands

```bash
# Development
npm run dev                     # Start NestJS in watch mode
npm run build                   # Build for production
npm run start                   # Start built app

# Database
npm run prisma:generate         # Generate Prisma client (required after schema changes)
npm run prisma:migrate          # Create and apply migrations in development
npm run prisma:migrate:deploy   # Apply migrations in production
npm run prisma:seed             # Seed baseline roles/permissions
npm run prisma:studio           # Open Prisma Studio GUI

# Testing & Quality
npm run test                    # Run all Jest tests
npm run lint                    # Run ESLint with zero warnings policy

# Utilities
npm run loadtest                # Run autocannon load test
npm run ws:smoke                # WebSocket smoke test
```

## Architecture Overview

### Module Structure

The application follows NestJS modular architecture with clear separation of concerns:

- **`src/modules/`** - Business domain modules (auth, users, buildings, maintenance-requests, notifications, parking, etc.)
- **`src/infra/`** - Infrastructure layer (prisma, logger, storage, queue, metrics)
- **`src/common/`** - Shared utilities (guards, decorators, pipes, filters, interceptors, building-access service)
- **`src/config/`** - Environment configuration with Zod validation

### Core Architectural Concepts

#### 1. Multi-Tenant Org Scoping

Every resource belongs to an **Org** (organization). The system enforces org-scoping at multiple levels:

- Database: Most models have `orgId` foreign key with cascade delete
- Guards: `OrgScopeGuard` validates that authenticated users can only access resources in their org
- Utility: `assertOrgScope(user)` throws if user lacks org context

**Platform vs Org Routes:**
- **Platform routes** (`/api/platform/*`) - Cross-org operations requiring platform superadmin permissions or `PLATFORM_API_KEY`
- **Org routes** (`/api/org/*`) - Org-scoped operations for org admins, managers, and staff

#### 2. Role-Based Access Control (RBAC)

The system uses a flexible RBAC model defined in Prisma schema:

- **Role** - Named role with permission set (e.g., `org_admin`, `manager`, `staff`, `resident`)
- **Permission** - Granular permission key (e.g., `buildings.write`, `requests.assign`)
- **UserRole** - Many-to-many: users can have multiple roles
- **UserPermission** - User-specific permission overrides with ALLOW/DENY effects
- **RolePermission** - Defines which permissions each role has

**Default roles** are defined in [access-control/role-defaults.ts](src/modules/access-control/role-defaults.ts) and seeded per org during org creation.

**Effective permissions** are computed by `AccessControlService.getUserEffectivePermissions()`:
1. Collect permissions from all user's roles
2. Apply user-specific overrides (DENY takes precedence)
3. Return a Set of permission keys

**Permission checking** happens via:
- `@RequirePermissions('key1', 'key2')` decorator on controllers/methods
- `PermissionsGuard` validates user has all required permissions
- Computed permissions are cached on `request.effectivePermissions` per request

#### 3. Building-Scoped Access Control

Buildings have an additional access layer via **BuildingAssignment**:

**Assignment Types:**
- `BUILDING_ADMIN` - Full write access to building resources (bypasses most permission checks)
- `MANAGER` - Read access + conditional write (requires explicit global permissions)
- `STAFF` - Read access only
- Residents - Have active `Occupancy` records (not assignments)

**Access Resolution** (`BuildingAccessService`):

For **READ** access:
1. Check global RBAC permissions (if provided)
2. Check building assignment (STAFF, MANAGER, or BUILDING_ADMIN)
3. If `allowResident: true`, check active occupancy

For **WRITE** access:
1. `BUILDING_ADMIN` assignment → always allowed
2. `MANAGER` with `allowManagerWrite: true` → requires global permissions + manager assignment
3. Otherwise → requires global permissions

**Usage in controllers:**
```typescript
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@RequireBuildingRead() // or @RequireBuildingWrite()
async getBuilding(@Param('buildingId') buildingId: string) { ... }
```

The `BuildingAccessGuard` uses metadata from decorators and calls `BuildingAccessService` to enforce access rules.

#### 4. Request Flow & Guards

Typical guard chain for protected endpoints:

1. **ThrottlerGuard** (global) - Rate limiting
2. **JwtAuthGuard** - Validates JWT, attaches `user` to request
3. **OrgScopeGuard** - Ensures user belongs to an org
4. **PermissionsGuard** - Checks `@RequirePermissions()` metadata
5. **BuildingAccessGuard** - Checks `@RequireBuildingRead/Write()` metadata

**Request context** (`RequestContext` type):
```typescript
{
  user?: AuthenticatedUser;           // JWT payload (sub, email, orgId, etc.)
  effectivePermissions?: Set<string>; // Cached permissions for this request
}
```

### Data Model Highlights

Key Prisma models and relationships:

- **Org** → Buildings, Users, Roles, Notifications, Parking, Maintenance
- **Building** → Units, Amenities, Assignments, Occupancies, Maintenance Requests
- **Unit** → Occupancies (many), Owner, UnitType, Amenities
- **User** → UserRoles, UserPermissions, BuildingAssignments, Occupancies (as resident), MaintenanceRequests
- **Occupancy** - Links resident User to Unit in a Building (status: ACTIVE/ENDED)
- **BuildingAssignment** - Links User to Building with a type (MANAGER/STAFF/BUILDING_ADMIN)
- **MaintenanceRequest** - Status workflow: OPEN → ASSIGNED → IN_PROGRESS → COMPLETED (or CANCELED)
- **Notification** - Emitted for maintenance events, delivered via WebSocket and REST

**Important enums:**
- `BuildingAssignmentType`: MANAGER, STAFF, BUILDING_ADMIN
- `MaintenanceRequestStatus`: OPEN, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELED
- `NotificationType`: REQUEST_CREATED, REQUEST_ASSIGNED, REQUEST_STATUS_CHANGED, REQUEST_COMMENTED, REQUEST_CANCELED

### Testing Strategy

- **E2E tests** in `test/` directory use in-memory repositories and mock guards
- Tests bypass auth guards by providing mock `@Injectable()` guards that always return true
- Each test file typically creates a fresh NestJS testing module with mocked dependencies
- Run specific test: `npm test -- test/building-access.e2e.spec.ts`

### Key Patterns to Follow

#### Permission-Gated Endpoints

When adding new endpoints that modify resources:

1. Identify required permission keys (e.g., `units.write`, `requests.assign`)
2. Add `@RequirePermissions('key')` decorator
3. For building-scoped routes, add `@RequireBuildingRead()` or `@RequireBuildingWrite()`
4. Update `role-defaults.ts` if new default roles should have these permissions

#### Manager vs BUILDING_ADMIN

- **BUILDING_ADMIN** assignments bypass most write permission checks for that building
- **MANAGER** assignments require explicit global permissions (via `allowManagerWrite: true`)
- Recent change: Managers no longer bypass permission checks, they must have the required global permissions AND be assigned to the building

#### Adding New Building-Scoped Resources

1. Add `buildingId` and `orgId` foreign keys to Prisma model
2. Add cascading deletes: `onDelete: Cascade` for org/building relations
3. Create routes under `/api/org/buildings/:buildingId/...`
4. Use `BuildingAccessService.canRead/WriteBuildingResource()` or `BuildingAccessGuard`
5. Always validate building belongs to user's org

#### Environment Variables

All env vars are validated via Zod schema in [config/env.schema.ts](src/config/env.schema.ts). Common vars:

- `DATABASE_URL` - Postgres connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - JWT signing keys
- `PLATFORM_API_KEY` - Required for platform routes in production
- `WS_CORS_ORIGINS` - Comma-separated WebSocket CORS origins
- `NODE_ENV` - Controls production behavior (seeding blocked, metrics enabled, etc.)

#### Prisma Workflow

Always run `npm run prisma:generate` after modifying `prisma/schema.prisma`. The Prisma client is regenerated and must be committed. When creating migrations:

```bash
npm run prisma:migrate      # Creates migration file and applies it
# Review migration SQL in prisma/migrations/
git add prisma/migrations/
```

#### Notifications & Events

The system uses NestJS EventEmitter for internal events:

1. Service emits event (e.g., `this.eventEmitter.emit('maintenance.request.created', payload)`)
2. `NotificationsService` listens via `@OnEvent()` decorators
3. Notification records are created in DB
4. WebSocket gateway pushes to connected clients
5. REST API: `GET /api/notifications` for polling

WebSocket namespace: `/notifications` (Socket.IO)

## Common Debugging Notes

- **"Missing required permissions"** - Check user's roles in Prisma Studio, verify role has permission in `RolePermission`, or add explicit `UserPermission`
- **"Building not found"** - User likely in wrong org or building deleted
- **Prisma client errors** - Run `npm run prisma:generate` after schema changes
- **Migration conflicts** - Never edit applied migrations; create new migration to fix schema
- **Tests failing** - Ensure in-memory repo mock matches real repo interface; check guard mocks are properly injected

You are a backend Codex agent working on TowerDesk Backend (NestJS + Prisma + Postgres).

TASK: Chunk 1 — Prisma schema + migration ONLY.
Do NOT create controllers, services, or APIs yet.

GOAL
Add database support for parking slots and dynamic parking allocation.
Parking slots are shared per building and NOT tied to units.
Tenants (occupancies) can be allocated multiple parking slots.
Vehicle numbers are informational only and NOT tied to specific slots.

PRISMA MODELS TO ADD

1) ParkingSlot
- id: String @id @default(cuid())
- orgId: String
- buildingId: String
- code: String (human readable slot number, unique per building)
- level: String? (optional)
- type: enum ParkingSlotType (CAR, BIKE, EV)
- isCovered: Boolean @default(false)
- isActive: Boolean @default(true)
- createdAt: DateTime @default(now())

Relations:
- belongs to Org
- belongs to Building

Indexes / constraints:
- @@unique([buildingId, code])
- @@index([orgId, buildingId])

2) ParkingAllocation
- id: String @id @default(cuid())
- orgId: String
- buildingId: String
- parkingSlotId: String
- occupancyId: String
- startDate: DateTime
- endDate: DateTime? (null = active allocation)
- createdAt: DateTime @default(now())

Relations:
- belongs to ParkingSlot
- belongs to Occupancy
- belongs to Building
- belongs to Org

Indexes / constraints:
- @@index([orgId, buildingId])
- @@index([orgId, occupancyId])
- @@index([parkingSlotId])

NOTE:
Do NOT attempt partial unique indexes for active allocations yet.
Allocation conflict prevention will be handled at service level in later chunks.

3) Vehicle (informational only)
- id: String @id @default(cuid())
- orgId: String
- occupancyId: String
- plateNumber: String
- label: String?
- createdAt: DateTime @default(now())

Relations:
- belongs to Occupancy
- belongs to Org

Indexes / constraints:
- @@index([orgId, occupancyId])
- @@unique([orgId, plateNumber]) (OK to assume plate numbers are unique per org)

ENUM
- ParkingSlotType { CAR, BIKE, EV }

DELIVERABLES
- Update prisma/schema.prisma
- Generate and commit Prisma migration
- Run prisma generate
- Ensure no TypeScript or Prisma errors

DO NOT:
- Add APIs
- Add permissions
- Modify seed data (will be done later)
- Touch NestJS modules

Stop after schema + migration are complete.

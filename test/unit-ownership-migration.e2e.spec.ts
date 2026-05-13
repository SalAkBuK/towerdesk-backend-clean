import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { UnitOwnershipService } from '../src/modules/unit-ownerships/unit-ownership.service';

type UnitPointer = {
  id: string;
  orgId: string;
  ownerId: string | null;
};

type UnitOwnershipRow = {
  id: string;
  orgId: string;
  unitId: string;
  ownerId: string;
  startDate: Date;
  endDate: Date | null;
  isPrimary: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryOwnershipPrisma {
  private rows: UnitOwnershipRow[] = [];

  unitOwnership = {
    findMany: async ({
      where,
      orderBy,
    }: {
      where: {
        unitId: string;
        endDate: null;
      };
      orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      let filtered = this.rows.filter(
        (row) => row.unitId === where.unitId && row.endDate === null,
      );
      if (orderBy?.length) {
        filtered = filtered.slice().sort((a, b) => {
          for (const ordering of orderBy) {
            if (ordering.createdAt && a.createdAt.getTime() !== b.createdAt.getTime()) {
              return ordering.createdAt === 'asc'
                ? a.createdAt.getTime() - b.createdAt.getTime()
                : b.createdAt.getTime() - a.createdAt.getTime();
            }
            if (ordering.id && a.id !== b.id) {
              return ordering.id === 'asc'
                ? a.id.localeCompare(b.id)
                : b.id.localeCompare(a.id);
            }
          }
          return 0;
        });
      }
      return filtered;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        unitId: string;
        endDate: null;
        ownerId?: { not: string };
      };
      data: { endDate: Date };
    }) => {
      let count = 0;
      for (const row of this.rows) {
        if (row.unitId !== where.unitId || row.endDate !== null) {
          continue;
        }
        if (where.ownerId?.not && row.ownerId === where.ownerId.not) {
          continue;
        }
        row.endDate = data.endDate;
        row.updatedAt = new Date();
        count += 1;
      }
      return { count };
    },
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        unitId: string;
        ownerId: string;
        startDate: Date;
        endDate: Date | null;
        isPrimary: boolean;
      };
    }) => {
      const now = new Date();
      const created: UnitOwnershipRow = {
        id: randomUUID(),
        orgId: data.orgId,
        unitId: data.unitId,
        ownerId: data.ownerId,
        startDate: data.startDate,
        endDate: data.endDate,
        isPrimary: data.isPrimary,
        createdAt: now,
        updatedAt: now,
      };
      this.rows.push(created);
      return created;
    },
  };

  backfillFromUnitPointers(units: UnitPointer[], migrationAt: Date) {
    for (const unit of units) {
      if (!unit.ownerId) {
        continue;
      }
      const hasActive = this.rows.some(
        (row) => row.unitId === unit.id && row.endDate === null,
      );
      if (hasActive) {
        continue;
      }
      this.rows.push({
        id: randomUUID(),
        orgId: unit.orgId,
        unitId: unit.id,
        ownerId: unit.ownerId,
        startDate: migrationAt,
        endDate: null,
        isPrimary: true,
        createdAt: migrationAt,
        updatedAt: migrationAt,
      });
    }
  }

  listActiveByUnit(unitId: string) {
    return this.rows.filter((row) => row.unitId === unitId && row.endDate === null);
  }

  listByUnit(unitId: string) {
    return this.rows.filter((row) => row.unitId === unitId);
  }
}

function resolveOwnerDuringMigration(
  unit: UnitPointer,
  rows: UnitOwnershipRow[],
) {
  const active = rows.find((row) => row.endDate === null);
  if (active) {
    return { ownerId: active.ownerId, source: 'ownership' as const };
  }
  return { ownerId: unit.ownerId, source: 'pointer' as const };
}

function assertPointerInvariant(
  prisma: InMemoryOwnershipPrisma,
  unit: UnitPointer,
) {
  const activeRows = prisma.listActiveByUnit(unit.id);
  if (!unit.ownerId) {
    expect(activeRows).toHaveLength(0);
    return;
  }
  expect(activeRows).toHaveLength(1);
  expect(activeRows[0].ownerId).toBe(unit.ownerId);
}

describe('Unit ownership migration and invariants (integration)', () => {
  it('keeps migration SQL guarantees for backfill and active-row invariant', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260405151000_unit_ownership_history',
        'migration.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE "UnitOwnership"');
    expect(sql).toContain('INSERT INTO "UnitOwnership"');
    expect(sql).toContain('FROM "Unit" unit');
    expect(sql).toContain('WHERE unit."ownerId" IS NOT NULL');
    expect(sql).toContain('CURRENT_TIMESTAMP');
    expect(sql).toContain('CREATE UNIQUE INDEX "UnitOwnership_active_unit_unique"');
    expect(sql).toContain('WHERE "endDate" IS NULL');
  });

  it('backfills ownership, preserves dual-write behavior, and keeps pointer invariant', async () => {
    const prisma = new InMemoryOwnershipPrisma();
    const service = new UnitOwnershipService(
      prisma as unknown as PrismaService,
    );

    const units: UnitPointer[] = [
      { id: 'unit-1', orgId: 'org-1', ownerId: 'owner-a' },
      { id: 'unit-2', orgId: 'org-1', ownerId: null },
      { id: 'unit-3', orgId: 'org-1', ownerId: 'owner-c' },
    ];
    const migrationAt = new Date('2026-04-05T00:00:00.000Z');

    prisma.backfillFromUnitPointers(units, migrationAt);

    const unit1RowsAfterBackfill = prisma.listByUnit('unit-1');
    expect(unit1RowsAfterBackfill).toHaveLength(1);
    expect(unit1RowsAfterBackfill[0]).toMatchObject({
      ownerId: 'owner-a',
      endDate: null,
      isPrimary: true,
    });
    expect(unit1RowsAfterBackfill[0].startDate.toISOString()).toBe(
      migrationAt.toISOString(),
    );
    expect(prisma.listByUnit('unit-2')).toHaveLength(0);
    assertPointerInvariant(prisma, units[0]);

    units[0].ownerId = 'owner-b';
    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-1',
      ownerId: 'owner-b',
    });
    assertPointerInvariant(prisma, units[0]);
    const unit1RowsAfterChange = prisma.listByUnit('unit-1');
    expect(
      unit1RowsAfterChange.some(
        (row) => row.ownerId === 'owner-a' && row.endDate !== null,
      ),
    ).toBe(true);

    units[0].ownerId = null;
    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-1',
      ownerId: null,
    });
    assertPointerInvariant(prisma, units[0]);

    prisma.listByUnit('unit-3').forEach((row) => {
      row.endDate = new Date('2026-04-06T00:00:00.000Z');
    });
    const fallbackOnlyWhenMissing = resolveOwnerDuringMigration(
      units[2],
      prisma.listByUnit('unit-3'),
    );
    expect(fallbackOnlyWhenMissing).toEqual({
      ownerId: 'owner-c',
      source: 'pointer',
    });

    await service.syncCurrentOwner({
      orgId: 'org-1',
      unitId: 'unit-3',
      ownerId: 'owner-c',
    });
    const ownershipFirstAfterSync = resolveOwnerDuringMigration(
      units[2],
      prisma.listByUnit('unit-3'),
    );
    expect(ownershipFirstAfterSync).toEqual({
      ownerId: 'owner-c',
      source: 'ownership',
    });
  });
});


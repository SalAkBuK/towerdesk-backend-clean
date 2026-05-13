import { Injectable } from '@nestjs/common';
import { DbClient } from '../../infra/prisma/db-client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class UnitOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  async syncCurrentOwner(input: {
    orgId: string;
    unitId: string;
    ownerId?: string | null;
    tx?: DbClient;
  }) {
    const prisma = input.tx ?? this.prisma;
    const now = new Date();

    const activeRows = await prisma.unitOwnership.findMany({
      where: {
        unitId: input.unitId,
        endDate: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (!input.ownerId) {
      if (activeRows.length > 0) {
        await prisma.unitOwnership.updateMany({
          where: {
            unitId: input.unitId,
            endDate: null,
          },
          data: {
            endDate: now,
          },
        });
      }
      return;
    }

    const matchingActive = activeRows.find(
      (row) => row.ownerId === input.ownerId,
    );
    if (matchingActive && activeRows.length === 1) {
      return;
    }

    if (activeRows.length > 0) {
      await prisma.unitOwnership.updateMany({
        where: {
          unitId: input.unitId,
          endDate: null,
          ownerId: { not: input.ownerId },
        },
        data: {
          endDate: now,
        },
      });
    }

    if (!matchingActive) {
      await prisma.unitOwnership.create({
        data: {
          orgId: input.orgId,
          unitId: input.unitId,
          ownerId: input.ownerId,
          startDate: now,
          endDate: null,
          isPrimary: true,
        },
      });
    }
  }
}

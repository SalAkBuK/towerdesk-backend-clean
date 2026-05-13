import { Injectable } from '@nestjs/common';
import { LeaseHistoryAction, Prisma } from '@prisma/client';
import { DbClient } from '../../infra/prisma/db-client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class LeaseHistoryRepo {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      orgId: string;
      leaseId: string;
      action: LeaseHistoryAction;
      changedByUserId?: string | null;
      changes: Prisma.InputJsonValue;
    },
    tx?: DbClient,
  ) {
    const client = tx ?? this.prisma;
    return client.leaseHistory.create({
      data: {
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        changedByUserId: data.changedByUserId ?? null,
        changes: data.changes,
      },
    });
  }

  listByLeaseId(
    orgId: string,
    leaseId: string,
    options?: {
      action?: LeaseHistoryAction;
      order?: 'asc' | 'desc';
      limit?: number;
    },
  ) {
    return this.prisma.leaseHistory.findMany({
      where: {
        orgId,
        leaseId,
        ...(options?.action ? { action: options.action } : {}),
      },
      orderBy: [
        { createdAt: options?.order ?? 'desc' },
        { id: options?.order ?? 'desc' },
      ],
      take: options?.limit,
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  listByResident(
    orgId: string,
    residentUserId: string,
    options?: {
      action?: LeaseHistoryAction;
      order?: 'asc' | 'desc';
      cursor?: { id: string; value: Date };
      limit?: number;
    },
  ) {
    const order = options?.order ?? 'desc';

    const where: Prisma.LeaseHistoryWhereInput = {
      orgId,
      lease: {
        occupancy: { residentUserId },
      },
      ...(options?.action ? { action: options.action } : {}),
    };

    if (options?.cursor) {
      const op = order === 'desc' ? 'lt' : 'gt';
      where.AND = [
        {
          OR: [
            { createdAt: { [op]: options.cursor.value } },
            {
              AND: [
                { createdAt: options.cursor.value },
                { id: { [op]: options.cursor.id } },
              ],
            },
          ],
        },
      ];
    }

    return this.prisma.leaseHistory.findMany({
      where,
      orderBy: [{ createdAt: order }, { id: order }],
      take: options?.limit,
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        lease: {
          select: {
            id: true,
            status: true,
            buildingId: true,
            unitId: true,
            occupancyId: true,
            leaseStartDate: true,
            leaseEndDate: true,
          },
        },
      },
    });
  }
}

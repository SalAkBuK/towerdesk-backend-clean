import { Injectable } from '@nestjs/common';
import { Lease, LeaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

@Injectable()
export class LeasesRepo {
  constructor(private readonly prisma: PrismaService) {}

  listByOrg(
    orgId: string,
    options?: {
      status?: LeaseStatus | 'ALL';
      order?: 'asc' | 'desc';
      buildingId?: string;
      unitId?: string;
      residentUserId?: string;
      q?: string;
      dateFrom?: Date;
      dateTo?: Date;
      cursor?: { id: string; value: Date };
      limit?: number;
    },
  ) {
    const status = options?.status ?? 'ALL';
    const order = options?.order ?? 'desc';

    const where: Prisma.LeaseWhereInput = {
      orgId,
      ...(options?.buildingId ? { buildingId: options.buildingId } : {}),
      ...(options?.unitId ? { unitId: options.unitId } : {}),
      ...(options?.residentUserId
        ? {
            OR: [
              { residentUserId: options.residentUserId },
              { occupancy: { residentUserId: options.residentUserId } },
            ],
          }
        : {}),
      ...(status === 'ALL' ? {} : { status }),
    };

    const and: Prisma.LeaseWhereInput[] = [];

    if (options?.dateFrom || options?.dateTo) {
      and.push({
        leaseStartDate: {
          ...(options.dateFrom ? { gte: options.dateFrom } : {}),
          ...(options.dateTo ? { lte: options.dateTo } : {}),
        },
      });
    }

    if (options?.q) {
      and.push({
        OR: [
          { id: options.q },
          { unit: { label: { contains: options.q, mode: 'insensitive' } } },
          {
            building: { name: { contains: options.q, mode: 'insensitive' } },
          },
          {
            occupancy: {
              residentUser: {
                name: { contains: options.q, mode: 'insensitive' },
              },
            },
          },
          {
            occupancy: {
              residentUser: {
                email: { contains: options.q, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }

    if (options?.cursor) {
      const op = order === 'desc' ? 'lt' : 'gt';
      and.push({
        OR: [
          { leaseStartDate: { [op]: options.cursor.value } },
          {
            AND: [
              { leaseStartDate: options.cursor.value },
              { id: { [op]: options.cursor.id } },
            ],
          },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return this.prisma.lease.findMany({
      where,
      orderBy: [{ leaseStartDate: order }, { id: order }],
      take: options?.limit,
      include: {
        unit: { include: { unitType: true } },
        occupancy: { include: { residentUser: true } },
        residentUser: true,
      },
    });
  }

  findActiveLeaseByUnit(orgId: string, unitId: string) {
    return this.prisma.lease.findFirst({
      where: {
        orgId,
        unitId,
        status: LeaseStatus.ACTIVE,
        occupancy: { status: 'ACTIVE' },
      },
      include: {
        unit: { include: { unitType: true } },
        occupancy: { include: { residentUser: true } },
        residentUser: true,
      },
    });
  }

  findActiveLeaseByResident(orgId: string, residentUserId: string) {
    return this.prisma.lease.findFirst({
      where: {
        orgId,
        status: LeaseStatus.ACTIVE,
        occupancy: {
          residentUserId,
          status: 'ACTIVE',
        },
      },
      include: {
        unit: { include: { unitType: true } },
        occupancy: { include: { residentUser: true } },
        residentUser: true,
      },
      orderBy: [{ leaseStartDate: 'desc' }, { id: 'desc' }],
    });
  }

  findById(orgId: string, leaseId: string) {
    return this.prisma.lease.findFirst({
      where: { id: leaseId, orgId },
      include: {
        unit: { include: { unitType: true } },
        occupancy: { include: { residentUser: true } },
      },
    });
  }

  listByResident(
    orgId: string,
    residentUserId: string,
    options?: {
      status?: LeaseStatus | 'ALL';
      order?: 'asc' | 'desc';
      cursor?: { id: string; value: Date };
      limit?: number;
    },
  ) {
    const status = options?.status ?? 'ALL';
    const order = options?.order ?? 'desc';

    const where: Prisma.LeaseWhereInput = {
      orgId,
      OR: [{ residentUserId }, { occupancy: { residentUserId } }],
      ...(status === 'ALL' ? {} : { status }),
    };

    if (options?.cursor) {
      const op = order === 'desc' ? 'lt' : 'gt';
      where.AND = [
        {
          OR: [
            { leaseStartDate: { [op]: options.cursor.value } },
            {
              AND: [
                { leaseStartDate: options.cursor.value },
                { id: { [op]: options.cursor.id } },
              ],
            },
          ],
        },
      ];
    }

    return this.prisma.lease.findMany({
      where,
      orderBy: [{ leaseStartDate: order }, { id: order }],
      take: options?.limit,
      include: {
        unit: { include: { unitType: true } },
        occupancy: { include: { residentUser: true } },
        residentUser: true,
      },
    });
  }

  createLease(
    tx: DbClient,
    data: Prisma.LeaseUncheckedCreateInput,
  ): Promise<Lease> {
    return tx.lease.create({ data });
  }

  updateLease(
    tx: DbClient,
    leaseId: string,
    data: Prisma.LeaseUncheckedUpdateInput,
  ): Promise<Lease> {
    return tx.lease.update({
      where: { id: leaseId },
      data,
    });
  }

  async updateLeaseForOrg(
    orgId: string,
    leaseId: string,
    data: Prisma.LeaseUncheckedUpdateInput,
  ) {
    const updated = await this.prisma.lease.updateMany({
      where: { id: leaseId, orgId },
      data,
    });
    if (updated.count === 0) {
      return null;
    }
    return this.findById(orgId, leaseId);
  }
}

import { Injectable } from '@nestjs/common';
import { OccupancyStatus } from '@prisma/client';
import {
  OccupancySortField,
  OccupancySortOrder,
} from './dto/list-occupancies.query.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type OccupancyStatusFilter = OccupancyStatus | 'ALL';

@Injectable()
export class OccupanciesRepo {
  constructor(private readonly prisma: PrismaService) {}

  hasActiveForUnit(unitId: string) {
    return this.prisma.occupancy.findFirst({
      where: {
        unitId,
        status: OccupancyStatus.ACTIVE,
      },
    });
  }

  hasActiveForResident(residentUserId: string) {
    return this.prisma.occupancy.findFirst({
      where: {
        residentUserId,
        status: OccupancyStatus.ACTIVE,
      },
    });
  }

  createActive(buildingId: string, unitId: string, residentUserId: string) {
    return this.prisma.occupancy.create({
      data: {
        buildingId,
        unitId,
        residentUserId,
        status: OccupancyStatus.ACTIVE,
        endAt: null,
      },
      include: {
        unit: true,
        residentUser: true,
      },
    });
  }

  listByBuilding(
    buildingId: string,
    status: OccupancyStatusFilter = OccupancyStatus.ACTIVE,
    options?: {
      q?: string;
      cursor?: { id: string; value: string | Date };
      limit?: number;
      sort?: OccupancySortField;
      order?: OccupancySortOrder;
      includeProfile?: boolean;
    },
  ) {
    const includeProfile = options?.includeProfile ?? false;
    const sortField = options?.sort ?? 'createdAt';
    const sortOrder = options?.order ?? 'desc';
    const limit = options?.limit;
    const q = options?.q?.trim();
    const where: Record<string, unknown> = {
      buildingId,
      ...(status === 'ALL' ? {} : { status }),
    };
    if (q) {
      where.OR = [
        { residentUser: { name: { contains: q, mode: 'insensitive' } } },
        { residentUser: { email: { contains: q, mode: 'insensitive' } } },
        { unit: { label: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (options?.cursor) {
      const op = sortOrder === 'desc' ? 'lt' : 'gt';
      if (sortField === 'residentName') {
        where.AND = [
          {
            OR: [
              { residentUser: { name: { [op]: options.cursor.value } } },
              {
                AND: [
                  { residentUser: { name: options.cursor.value } },
                  { id: { [op]: options.cursor.id } },
                ],
              },
            ],
          },
        ];
      } else if (sortField === 'unitLabel') {
        where.AND = [
          {
            OR: [
              { unit: { label: { [op]: options.cursor.value } } },
              {
                AND: [
                  { unit: { label: options.cursor.value } },
                  { id: { [op]: options.cursor.id } },
                ],
              },
            ],
          },
        ];
      } else {
        where.AND = [
          {
            OR: [
              { [sortField]: { [op]: options.cursor.value } },
              {
                AND: [
                  { [sortField]: options.cursor.value },
                  { id: { [op]: options.cursor.id } },
                ],
              },
            ],
          },
        ];
      }
    }

    const orderBy =
      sortField === 'residentName'
        ? [{ residentUser: { name: sortOrder } }, { id: sortOrder }]
        : sortField === 'unitLabel'
          ? [{ unit: { label: sortOrder } }, { id: sortOrder }]
          : [{ [sortField]: sortOrder }, { id: sortOrder }];

    return this.prisma.occupancy.findMany({
      where,
      include: {
        unit: true,
        residentUser: includeProfile
          ? { include: { residentProfile: true } }
          : true,
      },
      orderBy,
      ...(limit ? { take: limit } : {}),
    });
  }

  listActiveByBuilding(buildingId: string) {
    return this.listByBuilding(buildingId, OccupancyStatus.ACTIVE);
  }

  countActiveByBuilding(buildingId: string) {
    return this.prisma.occupancy.count({
      where: {
        buildingId,
        status: OccupancyStatus.ACTIVE,
      },
    });
  }
}

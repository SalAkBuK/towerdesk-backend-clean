import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

export type BroadcastInput = {
  orgId: string;
  senderUserId: string;
  title: string;
  body?: string | null;
  buildingIds: string[];
  recipientCount: number;
  metadata: Record<string, unknown>;
};

type CursorInfo = {
  id: string;
  createdAt: Date;
};

@Injectable()
export class BroadcastsRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: BroadcastInput, tx?: DbClient) {
    const prisma = tx ?? this.prisma;
    return prisma.broadcast.create({
      data: {
        orgId: input.orgId,
        senderUserId: input.senderUserId,
        title: input.title,
        body: input.body ?? null,
        buildingIds: input.buildingIds,
        recipientCount: input.recipientCount,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      include: {
        senderUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findById(id: string, orgId: string) {
    return this.prisma.broadcast.findFirst({
      where: { id, orgId },
      include: {
        senderUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async list(
    orgId: string,
    options: {
      buildingId?: string;
      buildingIds?: string[];
      take: number;
      cursor?: CursorInfo;
    },
  ) {
    type WhereClause = {
      orgId: string;
      buildingIds?: { has: string };
      AND?: { buildingIds: { hasSome: string[] } }[];
      OR?: (
        | { createdAt: { lt: Date } }
        | { createdAt: Date; id: { lt: string } }
      )[];
    };

    const where: WhereClause = { orgId };

    if (options.buildingId) {
      where.buildingIds = { has: options.buildingId };
    }

    if (options.buildingIds && options.buildingIds.length > 0) {
      where.AND = [{ buildingIds: { hasSome: options.buildingIds } }];
    }

    if (options.cursor) {
      where.OR = [
        { createdAt: { lt: options.cursor.createdAt } },
        { createdAt: options.cursor.createdAt, id: { lt: options.cursor.id } },
      ];
    }

    return this.prisma.broadcast.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.take,
      include: {
        senderUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getActiveResidentUserIds(orgId: string, buildingIds?: string[]) {
    type OccupancyWhereClause = {
      status: 'ACTIVE';
      building: { orgId: string };
      residentUser: { isActive: true };
      buildingId?: { in: string[] };
    };

    const where: OccupancyWhereClause = {
      status: 'ACTIVE',
      building: { orgId },
      residentUser: { isActive: true },
    };

    if (buildingIds && buildingIds.length > 0) {
      where.buildingId = { in: buildingIds };
    }

    const occupancies = await this.prisma.occupancy.findMany({
      where,
      select: { residentUserId: true },
      distinct: ['residentUserId'],
    });

    return occupancies.map((o) => o.residentUserId);
  }

  async getBuildingAssignmentUserIds(
    orgId: string,
    buildingIds: string[],
    roleTemplateKeys: string[],
  ) {
    if (buildingIds.length === 0 || roleTemplateKeys.length === 0) {
      return [];
    }

    const assignments = await this.prisma.userAccessAssignment.findMany({
      where: {
        scopeType: 'BUILDING',
        scopeId: { in: buildingIds },
        roleTemplate: {
          orgId,
          scopeType: 'BUILDING',
          key: { in: roleTemplateKeys },
        },
        user: { isActive: true, orgId },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return assignments.map((assignment) => assignment.userId);
  }

  async getAdminUserIds(orgId: string) {
    const roles = await this.prisma.userAccessAssignment.findMany({
      where: {
        scopeType: 'ORG',
        scopeId: null,
        roleTemplate: { orgId, scopeType: 'ORG', key: { in: ['org_admin'] } },
        user: { isActive: true, orgId },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return roles.map((entry) => entry.userId);
  }

  async getActiveOrgUserIds(orgId: string) {
    const users = await this.prisma.user.findMany({
      where: { orgId, isActive: true },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }

  async getOrgBuildingIds(orgId: string) {
    const buildings = await this.prisma.building.findMany({
      where: { orgId },
      select: { id: true },
    });
    return buildings.map((b) => b.id);
  }

  async getUserBuildingIdsWithPermission(
    userId: string,
    orgId: string,
    permissionKey: string,
  ) {
    const assignments = await this.prisma.userAccessAssignment.findMany({
      where: {
        userId,
        scopeType: 'BUILDING',
        roleTemplate: {
          orgId,
          scopeType: 'BUILDING',
          rolePermissions: {
            some: {
              permission: {
                key: permissionKey,
              },
            },
          },
        },
      },
      select: { scopeId: true },
      distinct: ['scopeId'],
    });
    return assignments
      .map((assignment) => assignment.scopeId)
      .filter((scopeId): scopeId is string => Boolean(scopeId));
  }
}

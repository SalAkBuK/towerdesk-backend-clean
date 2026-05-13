import {
  LeaseActivityAction,
  LeaseActivitySource,
  Prisma,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { DbClient } from '../../infra/prisma/db-client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class LeaseActivityRepo {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      orgId: string;
      leaseId: string;
      action: LeaseActivityAction;
      source?: LeaseActivitySource;
      changedByUserId?: string | null;
      payload: Prisma.InputJsonValue;
    },
    tx?: DbClient,
  ) {
    const client = tx ?? this.prisma;
    return client.leaseActivity.create({
      data: {
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        source: data.source ?? LeaseActivitySource.USER,
        changedByUserId: data.changedByUserId ?? null,
        payload: data.payload,
      },
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

  listByLeaseId(
    orgId: string,
    leaseId: string,
    options?: {
      action?: LeaseActivityAction;
      order?: 'asc' | 'desc';
      limit?: number;
    },
  ) {
    return this.prisma.leaseActivity.findMany({
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
}

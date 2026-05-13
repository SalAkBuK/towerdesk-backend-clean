import { Injectable } from '@nestjs/common';
import { LeaseOccupant } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

@Injectable()
export class LeaseOccupantsRepo {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: DbClient) {
    return tx ?? this.prisma;
  }

  listByLeaseId(leaseId: string): Promise<LeaseOccupant[]> {
    return this.prisma.leaseOccupant.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  deleteByLeaseId(leaseId: string, tx?: DbClient) {
    const prisma = this.client(tx);
    return prisma.leaseOccupant.deleteMany({
      where: { leaseId },
    });
  }

  createMany(leaseId: string, names: string[], tx?: DbClient) {
    if (names.length === 0) {
      return Promise.resolve({ count: 0 });
    }
    const prisma = this.client(tx);
    return prisma.leaseOccupant.createMany({
      data: names.map((name) => ({
        leaseId,
        name,
      })),
    });
  }
}

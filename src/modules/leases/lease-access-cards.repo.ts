import { Injectable } from '@nestjs/common';
import { AccessItemStatus, LeaseAccessCard } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

type LeaseAccessCardCreateData = {
  cardNumber: string;
};

@Injectable()
export class LeaseAccessCardsRepo {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: DbClient) {
    return tx ?? this.prisma;
  }

  listByLeaseId(leaseId: string): Promise<LeaseAccessCard[]> {
    return this.prisma.leaseAccessCard.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByNumbers(
    leaseId: string,
    cardNumbers: string[],
    tx?: DbClient,
  ): Promise<LeaseAccessCard[]> {
    const prisma = this.client(tx);
    return prisma.leaseAccessCard.findMany({
      where: { leaseId, cardNumber: { in: cardNumbers } },
    });
  }

  createMany(
    leaseId: string,
    data: LeaseAccessCardCreateData[],
    tx?: DbClient,
  ) {
    if (data.length === 0) {
      return Promise.resolve({ count: 0 });
    }
    const prisma = this.client(tx);
    return prisma.leaseAccessCard.createMany({
      data: data.map((item) => ({
        leaseId,
        cardNumber: item.cardNumber,
      })),
    });
  }

  findById(leaseId: string, cardId: string): Promise<LeaseAccessCard | null> {
    return this.prisma.leaseAccessCard.findFirst({
      where: { id: cardId, leaseId },
    });
  }

  updateStatus(
    cardId: string,
    status: AccessItemStatus,
    returnedAt: Date | null,
  ): Promise<LeaseAccessCard> {
    return this.prisma.leaseAccessCard.update({
      where: { id: cardId },
      data: {
        status,
        returnedAt,
      },
    });
  }

  deleteById(cardId: string, tx?: DbClient): Promise<LeaseAccessCard> {
    const prisma = this.client(tx);
    return prisma.leaseAccessCard.delete({
      where: { id: cardId },
    });
  }
}

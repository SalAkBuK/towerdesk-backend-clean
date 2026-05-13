import { Injectable } from '@nestjs/common';
import { AccessItemStatus, LeaseParkingSticker } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

type LeaseParkingStickerCreateData = {
  stickerNumber: string;
};

@Injectable()
export class LeaseParkingStickersRepo {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: DbClient) {
    return tx ?? this.prisma;
  }

  listByLeaseId(leaseId: string): Promise<LeaseParkingSticker[]> {
    return this.prisma.leaseParkingSticker.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByNumbers(
    leaseId: string,
    stickerNumbers: string[],
    tx?: DbClient,
  ): Promise<LeaseParkingSticker[]> {
    const prisma = this.client(tx);
    return prisma.leaseParkingSticker.findMany({
      where: { leaseId, stickerNumber: { in: stickerNumbers } },
    });
  }

  createMany(
    leaseId: string,
    data: LeaseParkingStickerCreateData[],
    tx?: DbClient,
  ) {
    if (data.length === 0) {
      return Promise.resolve({ count: 0 });
    }
    const prisma = this.client(tx);
    return prisma.leaseParkingSticker.createMany({
      data: data.map((item) => ({
        leaseId,
        stickerNumber: item.stickerNumber,
      })),
    });
  }

  findById(
    leaseId: string,
    stickerId: string,
  ): Promise<LeaseParkingSticker | null> {
    return this.prisma.leaseParkingSticker.findFirst({
      where: { id: stickerId, leaseId },
    });
  }

  updateStatus(
    stickerId: string,
    status: AccessItemStatus,
    returnedAt: Date | null,
  ): Promise<LeaseParkingSticker> {
    return this.prisma.leaseParkingSticker.update({
      where: { id: stickerId },
      data: {
        status,
        returnedAt,
      },
    });
  }

  deleteById(stickerId: string, tx?: DbClient): Promise<LeaseParkingSticker> {
    const prisma = this.client(tx);
    return prisma.leaseParkingSticker.delete({
      where: { id: stickerId },
    });
  }
}

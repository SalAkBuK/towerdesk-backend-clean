import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UnitType } from '@prisma/client';

@Injectable()
export class UnitTypesRepo {
  constructor(private readonly prisma: PrismaService) {}

  listActive(orgId: string): Promise<UnitType[]> {
    return this.prisma.unitType.findMany({
      where: { orgId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    orgId: string,
    data: { name: string; isActive?: boolean },
  ): Promise<UnitType> {
    return this.prisma.unitType.create({
      data: {
        orgId,
        name: data.name,
        isActive: data.isActive ?? true,
      },
    });
  }
}

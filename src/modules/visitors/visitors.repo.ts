import { Injectable } from '@nestjs/common';
import { OccupancyStatus, Prisma, VisitorStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

const visitorInclude = {
  unit: {
    include: {
      occupancies: {
        where: { status: OccupancyStatus.ACTIVE },
        include: { residentUser: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  },
} satisfies Prisma.VisitorInclude;

type VisitorWithRelations = Prisma.VisitorGetPayload<{
  include: typeof visitorInclude;
}>;

@Injectable()
export class VisitorsRepo {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.VisitorCreateInput): Promise<VisitorWithRelations> {
    return this.prisma.visitor.create({
      data,
      include: visitorInclude,
    });
  }

  listByBuilding(
    buildingId: string,
    filters?: { status?: VisitorStatus; unitId?: string },
  ): Promise<VisitorWithRelations[]> {
    return this.prisma.visitor.findMany({
      where: {
        buildingId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.unitId ? { unitId: filters.unitId } : {}),
      },
      include: visitorInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  listByUnit(
    unitId: string,
    filters?: { status?: VisitorStatus },
  ): Promise<VisitorWithRelations[]> {
    return this.prisma.visitor.findMany({
      where: {
        unitId,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: visitorInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdForBuilding(buildingId: string, visitorId: string) {
    return this.prisma.visitor.findFirst({
      where: { id: visitorId, buildingId },
    });
  }

  findByIdForBuildingWithUnit(
    buildingId: string,
    visitorId: string,
  ): Promise<VisitorWithRelations | null> {
    return this.prisma.visitor.findFirst({
      where: { id: visitorId, buildingId },
      include: visitorInclude,
    });
  }

  findByIdForUnitWithUnit(
    unitId: string,
    visitorId: string,
  ): Promise<VisitorWithRelations | null> {
    return this.prisma.visitor.findFirst({
      where: { id: visitorId, unitId },
      include: visitorInclude,
    });
  }

  update(
    visitorId: string,
    data: Prisma.VisitorUpdateInput,
  ): Promise<VisitorWithRelations> {
    return this.prisma.visitor.update({
      where: { id: visitorId },
      data,
      include: visitorInclude,
    });
  }
}

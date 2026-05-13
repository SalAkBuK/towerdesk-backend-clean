import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Building } from '@prisma/client';

type BuildingCreateData = {
  name: string;
  city: string;
  emirate?: string | null;
  country: string;
  timezone: string;
  floors?: number | null;
  unitsCount?: number | null;
};

@Injectable()
export class BuildingsRepo {
  constructor(private readonly prisma: PrismaService) {}

  create(orgId: string, data: BuildingCreateData): Promise<Building> {
    return this.prisma.building.create({
      data: {
        orgId,
        name: data.name,
        city: data.city,
        emirate: data.emirate ?? null,
        country: data.country,
        timezone: data.timezone,
        floors: data.floors ?? null,
        unitsCount: data.unitsCount ?? null,
      },
    });
  }

  listByOrg(orgId: string): Promise<Building[]> {
    return this.prisma.building.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAssignedToUser(orgId: string, userId: string): Promise<Building[]> {
    return this.prisma.building.findMany({
      where: {
        orgId,
        accessAssignments: {
          some: {
            userId,
            scopeType: 'BUILDING',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdForOrg(orgId: string, buildingId: string): Promise<Building | null> {
    return this.prisma.building.findFirst({
      where: {
        id: buildingId,
        orgId,
      },
    });
  }

  async deleteByIdForOrg(orgId: string, buildingId: string): Promise<number> {
    const result = await this.prisma.building.deleteMany({
      where: {
        id: buildingId,
        orgId,
      },
    });
    return result.count;
  }
}

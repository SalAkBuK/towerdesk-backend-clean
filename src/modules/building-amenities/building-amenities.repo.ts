import { Injectable } from '@nestjs/common';
import { BuildingAmenity } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class BuildingAmenitiesRepo {
  constructor(private readonly prisma: PrismaService) {}

  listByBuilding(buildingId: string): Promise<BuildingAmenity[]> {
    return this.prisma.buildingAmenity.findMany({
      where: { buildingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    buildingId: string,
    data: { name: string; isDefault?: boolean; isActive?: boolean },
  ): Promise<BuildingAmenity> {
    return this.prisma.buildingAmenity.create({
      data: {
        buildingId,
        name: data.name,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
      },
    });
  }

  update(
    amenityId: string,
    data: { name?: string; isDefault?: boolean; isActive?: boolean },
  ): Promise<BuildingAmenity> {
    return this.prisma.buildingAmenity.update({
      where: { id: amenityId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  findByIdForBuilding(
    buildingId: string,
    amenityId: string,
  ): Promise<BuildingAmenity | null> {
    return this.prisma.buildingAmenity.findFirst({
      where: { id: amenityId, buildingId },
    });
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { CreateBuildingAmenityDto } from './dto/create-building-amenity.dto';
import { UpdateBuildingAmenityDto } from './dto/update-building-amenity.dto';
import { BuildingAmenitiesRepo } from './building-amenities.repo';

@Injectable()
export class BuildingAmenitiesService {
  constructor(
    private readonly buildingAmenitiesRepo: BuildingAmenitiesRepo,
    private readonly buildingsRepo: BuildingsRepo,
  ) {}

  async list(user: AuthenticatedUser | undefined, buildingId: string) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return this.buildingAmenitiesRepo.listByBuilding(buildingId);
  }

  async create(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: CreateBuildingAmenityDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    try {
      return await this.buildingAmenitiesRepo.create(buildingId, dto);
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException('Amenity already exists');
      }
      throw error;
    }
  }

  async update(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    amenityId: string,
    dto: UpdateBuildingAmenityDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    const amenity = await this.buildingAmenitiesRepo.findByIdForBuilding(
      buildingId,
      amenityId,
    );
    if (!amenity) {
      throw new NotFoundException('Amenity not found');
    }
    return this.buildingAmenitiesRepo.update(amenityId, dto);
  }
}

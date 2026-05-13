import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { CreateBuildingDto } from './dto/create-building.dto';
import { BuildingsRepo } from './buildings.repo';

@Injectable()
export class BuildingsService {
  constructor(private readonly buildingsRepo: BuildingsRepo) {}

  create(user: AuthenticatedUser | undefined, dto: CreateBuildingDto) {
    const orgId = assertOrgScope(user);
    return this.buildingsRepo.create(orgId, {
      name: dto.name.trim(),
      city: dto.city.trim(),
      emirate: dto.emirate?.trim(),
      country: dto.country?.trim() ?? 'ARE',
      timezone: dto.timezone?.trim() ?? 'Asia/Dubai',
      floors: dto.floors,
      unitsCount: dto.unitsCount,
    });
  }

  list(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    return this.buildingsRepo.listByOrg(orgId);
  }

  listAssigned(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.buildingsRepo.listAssignedToUser(orgId, userId);
  }

  async getById(user: AuthenticatedUser | undefined, buildingId: string) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return building;
  }

  async delete(user: AuthenticatedUser | undefined, buildingId: string) {
    const orgId = assertOrgScope(user);
    const deletedCount = await this.buildingsRepo.deleteByIdForOrg(
      orgId,
      buildingId,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('Building not found');
    }
  }
}

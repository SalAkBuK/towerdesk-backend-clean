import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { mapOccupancyConstraintError } from '../../common/utils/occupancy-constraints';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { UnitsRepo } from '../units/units.repo';
import { UsersRepo } from '../users/users.repo';
import { CreateOccupancyDto } from './dto/create-occupancy.dto';
import {
  ListOccupanciesQueryDto,
  OccupancySortField,
} from './dto/list-occupancies.query.dto';
import { OccupanciesRepo } from './occupancies.repo';

@Injectable()
export class OccupanciesService {
  constructor(
    private readonly buildingsRepo: BuildingsRepo,
    private readonly unitsRepo: UnitsRepo,
    private readonly usersRepo: UsersRepo,
    private readonly occupanciesRepo: OccupanciesRepo,
  ) {}

  async create(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: CreateOccupancyDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const unit = await this.unitsRepo.findByIdForBuilding(
      buildingId,
      dto.unitId,
    );
    if (!unit) {
      throw new BadRequestException('Unit not in building');
    }

    const resident = await this.usersRepo.findById(dto.residentUserId);
    if (!resident || !resident.isActive || resident.orgId !== orgId) {
      throw new BadRequestException('Resident not in org');
    }

    const existingForUnit = await this.occupanciesRepo.hasActiveForUnit(
      unit.id,
    );
    if (existingForUnit) {
      throw new ConflictException('Unit is already occupied');
    }

    const existingForResident = await this.occupanciesRepo.hasActiveForResident(
      resident.id,
    );
    if (existingForResident) {
      throw new ConflictException('Resident already occupying a unit');
    }

    try {
      return await this.occupanciesRepo.createActive(
        buildingId,
        unit.id,
        resident.id,
      );
    } catch (error: unknown) {
      const mapped = mapOccupancyConstraintError(error);
      if (mapped) {
        throw mapped;
      }
      throw error;
    }
  }

  async list(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    query: ListOccupanciesQueryDto,
  ): Promise<{
    items: Awaited<ReturnType<OccupanciesRepo['listByBuilding']>>;
    nextCursor?: string;
  }> {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const status = query.status ?? 'ACTIVE';
    const sortField: OccupancySortField = query.sort ?? 'createdAt';
    const sortOrder = query.order ?? 'desc';
    const includeProfile = query.includeProfile === 'true';
    const limit = query.limit ?? (query.cursor ? 50 : undefined);
    const cursorInfo = query.cursor
      ? this.decodeCursor(query.cursor, sortField)
      : null;

    const items = await this.occupanciesRepo.listByBuilding(
      buildingId,
      status,
      {
        q: query.q,
        cursor: cursorInfo ?? undefined,
        limit: limit ? limit + 1 : undefined,
        sort: sortField,
        order: sortOrder,
        includeProfile,
      },
    );

    if (!limit) {
      return { items };
    }

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(sliced[sliced.length - 1], sortField)
      : undefined;

    return { items: sliced, nextCursor };
  }

  async countActive(user: AuthenticatedUser | undefined, buildingId: string) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    return this.occupanciesRepo.countActiveByBuilding(buildingId);
  }

  private encodeCursor(
    item: {
      id: string;
      createdAt: Date;
      startAt: Date;
      residentUser?: { name?: string | null };
      unit?: { label?: string | null };
    },
    field: OccupancySortField,
  ) {
    let value: string;
    if (field === 'residentName') {
      value = (item.residentUser?.name ?? '').toString();
    } else if (field === 'unitLabel') {
      value = (item.unit?.label ?? '').toString();
    } else if (field === 'startAt') {
      value = item.startAt.toISOString();
    } else {
      value = item.createdAt.toISOString();
    }
    return Buffer.from(JSON.stringify({ v: value, id: item.id })).toString(
      'base64',
    );
  }

  private decodeCursor(
    cursor: string,
    field: OccupancySortField,
  ): { id: string; value: string | Date } {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    let payload: { v: string; id: string };
    try {
      payload = JSON.parse(decoded) as { v: string; id: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    if (!payload?.id || payload.v === undefined) {
      throw new BadRequestException('Invalid cursor');
    }
    let value: string | Date = payload.v;
    if (field === 'createdAt' || field === 'startAt') {
      const date = new Date(payload.v);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid cursor');
      }
      value = date;
    }
    return { id: payload.id, value };
  }
}

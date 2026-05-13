import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VisitorStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { NotificationTypeEnum } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { UnitsRepo } from '../units/units.repo';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { ListVisitorsQueryDto } from './dto/list-visitors.query.dto';
import { CreateResidentVisitorDto } from './dto/create-resident-visitor.dto';
import { ListResidentVisitorsQueryDto } from './dto/list-resident-visitors.query.dto';
import { UpdateResidentVisitorDto } from './dto/update-resident-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { VisitorsRepo } from './visitors.repo';

@Injectable()
export class VisitorsService {
  constructor(
    private readonly visitorsRepo: VisitorsRepo,
    private readonly buildingsRepo: BuildingsRepo,
    private readonly unitsRepo: UnitsRepo,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: CreateVisitorDto,
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

    return this.visitorsRepo.create({
      org: { connect: { id: orgId } },
      building: { connect: { id: buildingId } },
      unit: { connect: { id: unit.id } },
      type: dto.type,
      visitorName: dto.visitorName,
      phoneNumber: dto.phoneNumber,
      emiratesId: dto.emiratesId,
      vehicleNumber: dto.vehicleNumber,
      expectedArrivalAt: dto.expectedArrivalAt
        ? new Date(dto.expectedArrivalAt)
        : undefined,
      notes: dto.notes,
    });
  }

  async list(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    query: ListVisitorsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    if (query.unitId) {
      const unit = await this.unitsRepo.findByIdForBuilding(
        buildingId,
        query.unitId,
      );
      if (!unit) {
        throw new BadRequestException('Unit not in building');
      }
    }

    return this.visitorsRepo.listByBuilding(buildingId, {
      status: query.status,
      unitId: query.unitId,
    });
  }

  async update(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    visitorId: string,
    dto: UpdateVisitorDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const existing = await this.visitorsRepo.findByIdForBuilding(
      buildingId,
      visitorId,
    );
    if (!existing) {
      throw new NotFoundException('Visitor not found');
    }

    if (dto.unitId !== undefined) {
      const unit = await this.unitsRepo.findByIdForBuilding(
        buildingId,
        dto.unitId,
      );
      if (!unit) {
        throw new BadRequestException('Unit not in building');
      }
    }

    const data = this.mapVisitorUpdate(dto);
    const updated = await this.visitorsRepo.update(visitorId, data);
    await this.notifyResidentsOnArrival(user, existing.status, updated);
    return updated;
  }

  async createResident(
    user: AuthenticatedUser | undefined,
    dto: CreateResidentVisitorDto,
  ) {
    const occupancy = await this.getResidentActiveOccupancy(user);

    return this.visitorsRepo.create({
      org: { connect: { id: occupancy.orgId } },
      building: { connect: { id: occupancy.buildingId } },
      unit: { connect: { id: occupancy.unitId } },
      type: dto.type,
      visitorName: dto.visitorName,
      phoneNumber: dto.phoneNumber,
      emiratesId: dto.emiratesId,
      vehicleNumber: dto.vehicleNumber,
      expectedArrivalAt: dto.expectedArrivalAt
        ? new Date(dto.expectedArrivalAt)
        : undefined,
      notes: dto.notes,
    });
  }

  async listResident(
    user: AuthenticatedUser | undefined,
    query: ListResidentVisitorsQueryDto,
  ) {
    const occupancy = await this.getResidentActiveOccupancy(user);
    return this.visitorsRepo.listByUnit(occupancy.unitId, {
      status: query.status,
    });
  }

  async getResident(user: AuthenticatedUser | undefined, visitorId: string) {
    const occupancy = await this.getResidentActiveOccupancy(user);
    const visitor = await this.visitorsRepo.findByIdForUnitWithUnit(
      occupancy.unitId,
      visitorId,
    );
    if (!visitor) {
      throw new NotFoundException('Visitor not found');
    }
    return visitor;
  }

  async updateResident(
    user: AuthenticatedUser | undefined,
    visitorId: string,
    dto: UpdateResidentVisitorDto,
  ) {
    const visitor = await this.getResident(user, visitorId);
    return this.visitorsRepo.update(
      visitor.id,
      this.mapResidentVisitorUpdate(dto),
    );
  }

  async cancelResident(user: AuthenticatedUser | undefined, visitorId: string) {
    const visitor = await this.getResident(user, visitorId);
    if (visitor.status !== VisitorStatus.EXPECTED) {
      throw new ConflictException('Only expected visitors can be canceled');
    }
    return this.visitorsRepo.update(visitor.id, {
      status: VisitorStatus.CANCELLED,
    });
  }

  private mapVisitorUpdate(dto: UpdateVisitorDto): Prisma.VisitorUpdateInput {
    const data: Prisma.VisitorUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.visitorName !== undefined) data.visitorName = dto.visitorName;
    if (dto.phoneNumber !== undefined) data.phoneNumber = dto.phoneNumber;
    if (dto.emiratesId !== undefined) data.emiratesId = dto.emiratesId;
    if (dto.vehicleNumber !== undefined) data.vehicleNumber = dto.vehicleNumber;
    if (dto.expectedArrivalAt !== undefined) {
      data.expectedArrivalAt = dto.expectedArrivalAt
        ? new Date(dto.expectedArrivalAt)
        : null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.unitId !== undefined) {
      data.unit = { connect: { id: dto.unitId } };
    }
    return data;
  }

  private mapResidentVisitorUpdate(
    dto: UpdateResidentVisitorDto,
  ): Prisma.VisitorUpdateInput {
    const data: Prisma.VisitorUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.visitorName !== undefined) data.visitorName = dto.visitorName;
    if (dto.phoneNumber !== undefined) data.phoneNumber = dto.phoneNumber;
    if (dto.emiratesId !== undefined) data.emiratesId = dto.emiratesId;
    if (dto.vehicleNumber !== undefined) data.vehicleNumber = dto.vehicleNumber;
    if (dto.expectedArrivalAt !== undefined) {
      data.expectedArrivalAt = dto.expectedArrivalAt
        ? new Date(dto.expectedArrivalAt)
        : null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;
    return data;
  }

  private async notifyResidentsOnArrival(
    user: AuthenticatedUser | undefined,
    previousStatus: VisitorStatus,
    visitor: Awaited<ReturnType<VisitorsRepo['update']>>,
  ) {
    if (
      previousStatus === VisitorStatus.ARRIVED ||
      visitor.status !== VisitorStatus.ARRIVED
    ) {
      return;
    }

    const recipientUserIds = Array.from(
      new Set(
        (visitor.unit.occupancies ?? [])
          .map((occupancy) => occupancy.residentUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (recipientUserIds.length === 0) {
      return;
    }

    await this.notificationsService.createForUsers({
      orgId: visitor.orgId,
      userIds: recipientUserIds,
      type: NotificationTypeEnum.VISITOR_ARRIVED,
      title: 'Visitor arrived',
      body: `${visitor.visitorName} has arrived at unit ${visitor.unit.label}`,
      data: {
        visitorId: visitor.id,
        buildingId: visitor.buildingId,
        unitId: visitor.unitId,
        status: visitor.status,
        visitorName: visitor.visitorName,
        actorUserId: user?.sub ?? null,
      },
    });
  }

  private async getResidentActiveOccupancy(
    user: AuthenticatedUser | undefined,
  ): Promise<{ orgId: string; buildingId: string; unitId: string }> {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new ConflictException(
        'Resident must have an active occupancy to manage visitors',
      );
    }
    const occupancies = await this.prisma.occupancy.findMany({
      where: {
        residentUserId: userId,
        status: 'ACTIVE',
        building: { orgId },
      },
      select: {
        buildingId: true,
        unitId: true,
      },
    });

    if (occupancies.length === 0) {
      throw new ConflictException(
        'Resident must have an active occupancy to manage visitors',
      );
    }

    if (occupancies.length > 1) {
      throw new ConflictException(
        'Resident must have exactly one active occupancy to manage visitors',
      );
    }

    return {
      orgId,
      buildingId: occupancies[0].buildingId,
      unitId: occupancies[0].unitId,
    };
  }
}

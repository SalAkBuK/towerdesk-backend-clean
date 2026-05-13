import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContext } from '../types/request-context';

type RequestScopeLookup = Partial<
  Pick<
    RequestContext,
    'params' | 'query' | 'body' | 'baseUrl' | 'route' | 'originalUrl'
  >
>;

@Injectable()
export class BuildingScopeResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForRequest(
    request: RequestScopeLookup,
    orgId: string | null | undefined,
  ): Promise<string | undefined> {
    if (!orgId) {
      return undefined;
    }

    const params = request.params ?? {};
    if (typeof params.buildingId === 'string') {
      return params.buildingId;
    }

    const query = request.query ?? {};
    if (typeof query.buildingId === 'string') {
      return query.buildingId;
    }

    const body = request.body ?? {};
    if (typeof body.buildingId === 'string') {
      return body.buildingId;
    }

    if (
      Array.isArray(body.buildingIds) &&
      body.buildingIds.length === 1 &&
      typeof body.buildingIds[0] === 'string'
    ) {
      return body.buildingIds[0];
    }

    if (typeof params.slotId === 'string') {
      return this.findParkingSlotBuildingId(params.slotId, orgId);
    }

    if (typeof params.allocationId === 'string') {
      return this.findParkingAllocationBuildingId(params.allocationId, orgId);
    }

    if (typeof params.vehicleId === 'string') {
      return this.findVehicleBuildingId(params.vehicleId, orgId);
    }

    if (typeof params.occupancyId === 'string') {
      return this.findOccupancyBuildingId(params.occupancyId, orgId);
    }

    if (typeof params.unitId === 'string') {
      return this.findUnitBuildingId(params.unitId, orgId);
    }

    if (typeof params.leaseId === 'string') {
      return this.findLeaseBuildingId(params.leaseId, orgId);
    }

    if (typeof params.contractId === 'string') {
      return this.findLeaseBuildingId(params.contractId, orgId);
    }

    if (typeof params.requestId === 'string') {
      return this.findRequestBuildingId(params.requestId, orgId, request);
    }

    if (typeof params.id === 'string') {
      return this.findEntityBuildingId(params.id, orgId, request);
    }

    return undefined;
  }

  private async findParkingSlotBuildingId(slotId: string, orgId: string) {
    const slot = await this.prisma.parkingSlot.findFirst({
      where: { id: slotId, orgId },
      select: { buildingId: true },
    });
    return slot?.buildingId;
  }

  private async findParkingAllocationBuildingId(
    allocationId: string,
    orgId: string,
  ) {
    const allocation = await this.prisma.parkingAllocation.findFirst({
      where: { id: allocationId, orgId },
      select: { buildingId: true },
    });
    return allocation?.buildingId;
  }

  private async findVehicleBuildingId(vehicleId: string, orgId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        orgId,
        occupancy: {
          building: {
            orgId,
          },
        },
      },
      select: {
        occupancy: {
          select: {
            buildingId: true,
          },
        },
      },
    });
    return vehicle?.occupancy.buildingId;
  }

  private async findOccupancyBuildingId(occupancyId: string, orgId: string) {
    const occupancy = await this.prisma.occupancy.findFirst({
      where: {
        id: occupancyId,
        building: {
          orgId,
        },
      },
      select: { buildingId: true },
    });
    return occupancy?.buildingId;
  }

  private async findUnitBuildingId(unitId: string, orgId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        building: {
          orgId,
        },
      },
      select: { buildingId: true },
    });
    return unit?.buildingId;
  }

  private async findLeaseBuildingId(leaseId: string, orgId: string) {
    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, orgId },
      select: { buildingId: true },
    });
    return lease?.buildingId;
  }

  private async findRequestBuildingId(
    requestId: string,
    orgId: string,
    request: RequestScopeLookup,
  ) {
    const routePath = this.getRoutePath(request);

    if (routePath.includes('move-in-requests')) {
      return this.findMoveInRequestBuildingId(requestId, orgId);
    }

    if (routePath.includes('move-out-requests')) {
      return this.findMoveOutRequestBuildingId(requestId, orgId);
    }

    if (routePath.includes('/requests')) {
      return this.findMaintenanceRequestBuildingId(requestId, orgId);
    }

    const moveInBuildingId = await this.findMoveInRequestBuildingId(
      requestId,
      orgId,
    );
    if (moveInBuildingId) {
      return moveInBuildingId;
    }

    const moveOutBuildingId = await this.findMoveOutRequestBuildingId(
      requestId,
      orgId,
    );
    if (moveOutBuildingId) {
      return moveOutBuildingId;
    }

    return this.findMaintenanceRequestBuildingId(requestId, orgId);
  }

  private async findEntityBuildingId(
    entityId: string,
    orgId: string,
    request: RequestScopeLookup,
  ) {
    const routePath = this.getRoutePath(request);

    if (routePath.includes('/org/conversations')) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: entityId, orgId },
        select: { buildingId: true },
      });
      return conversation?.buildingId ?? undefined;
    }

    return undefined;
  }

  private getRoutePath(request: RequestScopeLookup) {
    const route =
      typeof request.route?.path === 'string' ? request.route.path : '';
    const baseUrl = typeof request.baseUrl === 'string' ? request.baseUrl : '';
    const originalUrl =
      typeof request.originalUrl === 'string' ? request.originalUrl : '';

    return `${baseUrl} ${route} ${originalUrl}`.toLowerCase();
  }

  private async findMoveInRequestBuildingId(requestId: string, orgId: string) {
    const request = await this.prisma.moveInRequest.findFirst({
      where: { id: requestId, orgId },
      select: { buildingId: true },
    });
    return request?.buildingId;
  }

  private async findMoveOutRequestBuildingId(requestId: string, orgId: string) {
    const request = await this.prisma.moveOutRequest.findFirst({
      where: { id: requestId, orgId },
      select: { buildingId: true },
    });
    return request?.buildingId;
  }

  private async findMaintenanceRequestBuildingId(
    requestId: string,
    orgId: string,
  ) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, orgId },
      select: { buildingId: true },
    });
    return request?.buildingId;
  }
}

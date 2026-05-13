import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MaintenanceRequestCommentAuthorType,
  MaintenanceRequestCommentVisibility,
  MaintenanceRequestOwnerApprovalDecisionSource,
  MaintenanceRequestOwnerApprovalStatus,
  OwnerAccessGrantStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  MaintenanceRequestOwnerApprovalAuditActionEnum,
  MaintenanceRequestOwnerApprovalStatusEnum,
} from '../maintenance-requests/maintenance-requests.constants';
import { CreateRequestCommentDto } from '../maintenance-requests/dto/create-request-comment.dto';
import {
  MAINTENANCE_REQUEST_EVENTS,
  MaintenanceRequestEventPayload,
} from '../maintenance-requests/maintenance-requests.events';
import {
  buildRequesterContextMap,
  getRequesterContextOrDefault,
} from '../maintenance-requests/requester-context.enricher';
import { RequesterContextResponse } from '../maintenance-requests/dto/requester-context.response.dto';
import {
  buildRequestTenancyContextMap,
  getRequestTenancyContextOrDefault,
} from '../maintenance-requests/request-tenancy-context.enricher';
import { RequestTenancyContextResponse } from '../maintenance-requests/dto/request-tenancy-context.response.dto';

type PortfolioCommentRow = {
  id: string;
  requestId: string;
  message: string;
  createdAt: Date;
  visibility: string;
  authorType: string;
  authorOwnerId: string | null;
  authorUser: {
    id: string;
    name: string | null;
    email: string;
  };
};

type PortfolioUnitRow = {
  orgId: string;
  orgName: string;
  ownerId: string;
  unitId: string;
  buildingId: string;
  buildingName: string;
  unitLabel: string;
};

type PortfolioUnitTenantRow = {
  occupancyId: string;
  tenantUserId: string;
  name: string | null;
  email: string;
  phone: string | null;
};

type PortfolioRequestRow = {
  id: string;
  orgId: string;
  orgName: string;
  ownerId: string;
  buildingId: string;
  buildingName: string;
  unitId: string;
  unitLabel: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  type: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  assignedTo: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  attachments: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    createdAt: Date;
  }[];
  ownerApprovalStatus: string;
  ownerApprovalRequestedAt: Date | null;
  ownerApprovalRequestedByUserId: string | null;
  ownerApprovalDeadlineAt: Date | null;
  ownerApprovalDecidedAt: Date | null;
  ownerApprovalDecidedByOwnerUserId: string | null;
  ownerApprovalReason: string | null;
  approvalRequiredReason: string | null;
  estimatedAmount: string | null;
  estimatedCurrency: string | null;
  isEmergency: boolean;
  ownerApprovalDecisionSource: string | null;
  ownerApprovalOverrideReason: string | null;
  ownerApprovalOverriddenByUserId: string | null;
  occupancyIdAtCreation: string | null;
  leaseIdAtCreation: string | null;
  requesterContext: RequesterContextResponse;
  requestTenancyContext: RequestTenancyContextResponse;
};

type PortfolioRequestRowWithoutContext = Omit<
  PortfolioRequestRow,
  'requesterContext' | 'requestTenancyContext'
>;

type OwnerGrantRow = {
  ownerId: string;
  owner: {
    orgId: string | null;
  };
};

type ScopedUnitOwnershipRow = {
  ownerId: string;
  org: {
    id: string;
    name: string;
  };
  unit: {
    id: string;
    label: string;
    building: {
      id: string;
      name: string;
    };
  };
};

type ScopedFallbackUnitRow = {
  id: string;
  label: string;
  ownerId: string | null;
  building: {
    id: string;
    name: string;
    org: {
      id: string;
      name: string;
    };
  };
};

type AccessibleUnitScope = {
  rows: PortfolioUnitRow[];
  map: Map<string, PortfolioUnitRow>;
};

const accessibleRequestInclude = {
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  assignedToUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  attachments: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      url: true,
      createdAt: true,
    },
  },
} satisfies Prisma.MaintenanceRequestInclude;

type AccessibleMaintenanceRequest = Prisma.MaintenanceRequestGetPayload<{
  include: typeof accessibleRequestInclude;
}>;

@Injectable()
export class OwnerPortfolioScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async hasActiveOwnerAccess(userId: string) {
    const grant = await this.prisma.ownerAccessGrant.findFirst({
      where: {
        userId,
        status: OwnerAccessGrantStatus.ACTIVE,
        owner: {
          isActive: true,
        },
      },
      select: { id: true },
    });
    return Boolean(grant);
  }

  async getAccessibleOwnerIds(userId: string) {
    const grants = await this.loadActiveOwnerGrantRows(userId);
    return Array.from(new Set(grants.map((grant) => grant.ownerId)));
  }

  async listAccessibleOrgIds(userId: string) {
    const grants = await this.loadActiveOwnerGrantRows(userId);

    return Array.from(
      new Set(
        grants
          .map((grant) => grant.owner.orgId)
          .filter((orgId): orgId is string => Boolean(orgId)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  async listAccessibleUnits(userId: string): Promise<PortfolioUnitRow[]> {
    const scope = await this.loadAccessibleUnitScope(userId);
    return scope.rows;
  }

  async getPortfolioSummary(userId: string) {
    const units = await this.listAccessibleUnits(userId);
    return {
      unitCount: units.length,
      orgCount: new Set(units.map((unit) => unit.orgId)).size,
      buildingCount: new Set(units.map((unit) => unit.buildingId)).size,
    };
  }

  async getAccessibleUnitTenant(
    userId: string,
    unitId: string,
  ): Promise<PortfolioUnitTenantRow | null> {
    await this.getAccessibleUnitOrThrow(userId, unitId);

    const occupancy = await this.prisma.occupancy.findFirst({
      where: {
        unitId,
        status: 'ACTIVE',
        residentUser: {
          isActive: true,
        },
      },
      select: {
        id: true,
        residentUser: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (!occupancy) {
      return null;
    }

    return {
      occupancyId: occupancy.id,
      tenantUserId: occupancy.residentUser.id,
      name: occupancy.residentUser.name ?? null,
      email: occupancy.residentUser.email,
      phone: occupancy.residentUser.phone ?? null,
    };
  }

  async listAccessibleRequests(userId: string): Promise<PortfolioRequestRow[]> {
    const unitScope = await this.getAccessibleUnitScopeMap(userId);
    if (unitScope.size === 0) {
      return [];
    }

    const requests = await this.prisma.maintenanceRequest.findMany({
      where: {
        unitId: {
          in: Array.from(unitScope.keys()),
        },
      },
      include: accessibleRequestInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const rows = requests.reduce<PortfolioRequestRowWithoutContext[]>(
      (rows, request) => {
        const unitId = request.unitId;
        if (!unitId) {
          return rows;
        }
        const unit = unitScope.get(unitId);
        if (!unit) {
          return rows;
        }
        rows.push({
          id: request.id,
          orgId: unit.orgId,
          orgName: unit.orgName,
          ownerId: unit.ownerId,
          buildingId: unit.buildingId,
          buildingName: unit.buildingName,
          unitId: unit.unitId,
          unitLabel: unit.unitLabel,
          title: request.title,
          description: request.description ?? null,
          status: request.status,
          priority: request.priority ?? null,
          type: request.type ?? null,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
          createdBy: {
            id: request.createdByUser.id,
            name: request.createdByUser.name ?? null,
            email: request.createdByUser.email,
          },
          assignedTo: request.assignedToUser
            ? {
                id: request.assignedToUser.id,
                name: request.assignedToUser.name ?? null,
                email: request.assignedToUser.email,
              }
            : null,
          attachments: request.attachments,
          ownerApprovalStatus: request.ownerApprovalStatus,
          ownerApprovalRequestedAt: request.ownerApprovalRequestedAt ?? null,
          ownerApprovalRequestedByUserId:
            request.ownerApprovalRequestedByUserId ?? null,
          ownerApprovalDeadlineAt: request.ownerApprovalDeadlineAt ?? null,
          ownerApprovalDecidedAt: request.ownerApprovalDecidedAt ?? null,
          ownerApprovalDecidedByOwnerUserId:
            request.ownerApprovalDecidedByOwnerUserId ?? null,
          ownerApprovalReason: request.ownerApprovalReason ?? null,
          approvalRequiredReason: request.approvalRequiredReason ?? null,
          estimatedAmount: request.estimatedAmount?.toString() ?? null,
          estimatedCurrency: request.estimatedCurrency ?? null,
          isEmergency: request.isEmergency ?? false,
          ownerApprovalDecisionSource:
            request.ownerApprovalDecisionSource ?? null,
          ownerApprovalOverrideReason:
            request.ownerApprovalOverrideReason ?? null,
          ownerApprovalOverriddenByUserId:
            request.ownerApprovalOverriddenByUserId ?? null,
          occupancyIdAtCreation: request.occupancyIdAtCreation ?? null,
          leaseIdAtCreation: request.leaseIdAtCreation ?? null,
        });
        return rows;
      },
      [],
    );

    return this.withRequesterContextList(rows);
  }

  async getAccessibleRequestById(
    userId: string,
    requestId: string,
  ): Promise<PortfolioRequestRow> {
    const request = await this.getAccessibleRequestRowByIdOrThrow(
      userId,
      requestId,
    );
    return this.withRequesterContext(request);
  }

  async approveAccessibleRequest(
    userId: string,
    requestId: string,
    approvalReason?: string | null,
  ) {
    const accessible = await this.getAccessibleRequestById(userId, requestId);
    if (
      accessible.ownerApprovalStatus !==
      MaintenanceRequestOwnerApprovalStatusEnum.PENDING
    ) {
      throw new NotFoundException('Request not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceRequest.update({
        where: { id: requestId },
        data: {
          ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.APPROVED,
          ownerApprovalDecidedAt: new Date(),
          ownerApprovalDecidedByOwnerUser: { connect: { id: userId } },
          ownerApprovalReason: approvalReason ?? null,
          ownerApprovalDecisionSource:
            MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
          ownerApprovalOverrideReason: null,
          ownerApprovalOverriddenByUser: { disconnect: true },
        },
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
          assignedToUser: {
            select: { id: true, name: true, email: true },
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              url: true,
              createdAt: true,
            },
          },
        },
      });

      await tx.maintenanceRequestOwnerApprovalAudit.create({
        data: {
          requestId: updated.id,
          orgId: updated.orgId,
          actorUserId: userId,
          action: MaintenanceRequestOwnerApprovalAuditActionEnum.APPROVED,
          fromStatus:
            accessible.ownerApprovalStatus as MaintenanceRequestOwnerApprovalStatus,
          toStatus: MaintenanceRequestOwnerApprovalStatus.APPROVED,
          decisionSource: MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
          reason: approvalReason ?? null,
        },
      });

      return this.withRequesterContext(
        this.mapAccessibleRequest(updated, accessible),
      );
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_REQUEST_APPROVED, {
      request: this.toEventRequest(updated),
      actorUserId: userId,
    });

    return updated;
  }

  async rejectAccessibleRequest(
    userId: string,
    requestId: string,
    approvalReason: string,
  ) {
    const accessible = await this.getAccessibleRequestById(userId, requestId);
    if (
      accessible.ownerApprovalStatus !==
      MaintenanceRequestOwnerApprovalStatusEnum.PENDING
    ) {
      throw new NotFoundException('Request not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceRequest.update({
        where: { id: requestId },
        data: {
          ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.REJECTED,
          ownerApprovalDecidedAt: new Date(),
          ownerApprovalDecidedByOwnerUser: { connect: { id: userId } },
          ownerApprovalReason: approvalReason,
          ownerApprovalDecisionSource:
            MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
          ownerApprovalOverrideReason: null,
          ownerApprovalOverriddenByUser: { disconnect: true },
        },
        include: {
          createdByUser: {
            select: { id: true, name: true, email: true },
          },
          assignedToUser: {
            select: { id: true, name: true, email: true },
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              url: true,
              createdAt: true,
            },
          },
        },
      });

      await tx.maintenanceRequestOwnerApprovalAudit.create({
        data: {
          requestId: updated.id,
          orgId: updated.orgId,
          actorUserId: userId,
          action: MaintenanceRequestOwnerApprovalAuditActionEnum.REJECTED,
          fromStatus:
            accessible.ownerApprovalStatus as MaintenanceRequestOwnerApprovalStatus,
          toStatus: MaintenanceRequestOwnerApprovalStatus.REJECTED,
          decisionSource: MaintenanceRequestOwnerApprovalDecisionSource.OWNER,
          reason: approvalReason,
        },
      });

      return this.withRequesterContext(
        this.mapAccessibleRequest(updated, accessible),
      );
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_REQUEST_REJECTED, {
      request: this.toEventRequest(updated),
      actorUserId: userId,
    });

    return updated;
  }

  async listAccessibleRequestComments(
    userId: string,
    requestId: string,
  ): Promise<PortfolioCommentRow[]> {
    const accessible = await this.getAccessibleRequestById(userId, requestId);
    const comments = await this.prisma.maintenanceRequestComment.findMany({
      where: {
        orgId: accessible.orgId,
        requestId: accessible.id,
        visibility: MaintenanceRequestCommentVisibility.SHARED,
      },
      include: {
        authorUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const lastCommentCreatedAt = comments[comments.length - 1]?.createdAt;
    if (lastCommentCreatedAt) {
      await this.markAccessibleRequestCommentsRead(
        userId,
        accessible.id,
        lastCommentCreatedAt,
      );
    }

    return comments.map((comment) => ({
      id: comment.id,
      requestId: comment.requestId,
      message: comment.message,
      createdAt: comment.createdAt,
      visibility: comment.visibility,
      authorType: comment.authorType,
      authorOwnerId: comment.authorOwnerId ?? null,
      authorUser: {
        id: comment.authorUser.id,
        name: comment.authorUser.name ?? null,
        email: comment.authorUser.email,
      },
    }));
  }

  async countUnreadAccessibleRequestComments(userId: string) {
    const requestIds = await this.listAccessibleRequestIds(userId);
    if (requestIds.length === 0) {
      return 0;
    }

    const [readStates, comments] = await Promise.all([
      this.prisma.ownerRequestCommentReadState.findMany({
        where: {
          userId,
          requestId: { in: requestIds },
        },
        select: {
          requestId: true,
          lastReadAt: true,
        },
      }),
      this.prisma.maintenanceRequestComment.findMany({
        where: {
          requestId: { in: requestIds },
          visibility: MaintenanceRequestCommentVisibility.SHARED,
          authorUserId: { not: userId },
        },
        select: {
          requestId: true,
          createdAt: true,
        },
      }),
    ]);

    const lastReadAtByRequestId = new Map(
      readStates.map((state) => [state.requestId, state.lastReadAt]),
    );

    return comments.reduce((count, comment) => {
      const lastReadAt = lastReadAtByRequestId.get(comment.requestId);
      if (!lastReadAt || comment.createdAt > lastReadAt) {
        return count + 1;
      }
      return count;
    }, 0);
  }

  async addAccessibleRequestComment(
    userId: string,
    requestId: string,
    dto: CreateRequestCommentDto,
  ): Promise<PortfolioCommentRow> {
    const accessible = await this.getAccessibleRequestById(userId, requestId);

    const comment = await this.prisma.maintenanceRequestComment.create({
      data: {
        request: { connect: { id: accessible.id } },
        org: { connect: { id: accessible.orgId } },
        authorUser: { connect: { id: userId } },
        authorOwner: { connect: { id: accessible.ownerId } },
        authorType: MaintenanceRequestCommentAuthorType.OWNER,
        visibility: MaintenanceRequestCommentVisibility.SHARED,
        message: dto.message,
      },
      include: {
        authorUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await this.markAccessibleRequestCommentsRead(
      userId,
      accessible.id,
      comment.createdAt,
    );

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.COMMENTED, {
      request: this.toEventRequest(accessible),
      actorUserId: userId,
      actorIsResident: false,
      comment: { id: comment.id, message: comment.message },
    });

    return {
      id: comment.id,
      requestId: comment.requestId,
      message: comment.message,
      createdAt: comment.createdAt,
      visibility: comment.visibility,
      authorType: comment.authorType,
      authorOwnerId: comment.authorOwnerId ?? null,
      authorUser: {
        id: comment.authorUser.id,
        name: comment.authorUser.name ?? null,
        email: comment.authorUser.email,
      },
    };
  }

  async getAccessibleUnitOrThrow(
    userId: string,
    unitId: string,
  ): Promise<PortfolioUnitRow> {
    const scope = await this.loadAccessibleUnitScope(userId, { unitId });
    const unit = scope.map.get(unitId);
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  private async loadActiveOwnerGrantRows(
    userId: string,
  ): Promise<OwnerGrantRow[]> {
    return this.prisma.ownerAccessGrant.findMany({
      where: {
        userId,
        status: OwnerAccessGrantStatus.ACTIVE,
        owner: {
          isActive: true,
        },
      },
      select: {
        ownerId: true,
        owner: {
          select: {
            orgId: true,
          },
        },
      },
    });
  }

  private async loadAccessibleUnitScope(
    userId: string,
    filters?: { unitId?: string },
  ): Promise<AccessibleUnitScope> {
    const grants = await this.loadActiveOwnerGrantRows(userId);
    const ownerIds = Array.from(new Set(grants.map((grant) => grant.ownerId)));
    if (ownerIds.length === 0) {
      return {
        rows: [],
        map: new Map<string, PortfolioUnitRow>(),
      };
    }

    const unitOwnershipWhere: Prisma.UnitOwnershipWhereInput = {
      ownerId: { in: ownerIds },
      endDate: null,
      owner: {
        isActive: true,
        accessGrants: {
          some: {
            userId,
            status: OwnerAccessGrantStatus.ACTIVE,
          },
        },
      },
      ...(filters?.unitId ? { unitId: filters.unitId } : {}),
    };

    const unitWhere: Prisma.UnitWhereInput = {
      ownerId: { in: ownerIds },
      owner: {
        isActive: true,
        accessGrants: {
          some: {
            userId,
            status: OwnerAccessGrantStatus.ACTIVE,
          },
        },
      },
      ownerships: {
        none: {
          endDate: null,
        },
      },
      ...(filters?.unitId ? { id: filters.unitId } : {}),
    };

    const [ownershipRows, fallbackUnits] = await Promise.all([
      this.prisma.unitOwnership.findMany({
        where: unitOwnershipWhere,
        include: {
          org: { select: { id: true, name: true } },
          unit: {
            select: {
              id: true,
              label: true,
              building: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.unit.findMany({
        where: unitWhere,
        select: {
          id: true,
          label: true,
          ownerId: true,
          building: {
            select: {
              id: true,
              name: true,
              org: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const rows = this.normalizeAccessibleUnitRows(ownershipRows, fallbackUnits);
    return {
      rows,
      map: new Map(rows.map((unit) => [unit.unitId, unit])),
    };
  }

  private normalizeAccessibleUnitRows(
    ownershipRows: ScopedUnitOwnershipRow[],
    fallbackUnits: ScopedFallbackUnitRow[],
  ): PortfolioUnitRow[] {
    const rows: PortfolioUnitRow[] = [
      ...ownershipRows.map((row) => ({
        orgId: row.org.id,
        orgName: row.org.name,
        ownerId: row.ownerId,
        unitId: row.unit.id,
        buildingId: row.unit.building.id,
        buildingName: row.unit.building.name,
        unitLabel: row.unit.label,
      })),
      ...fallbackUnits
        .filter((unit): unit is ScopedFallbackUnitRow & { ownerId: string } =>
          Boolean(unit.ownerId),
        )
        .map((unit) => ({
          orgId: unit.building.org.id,
          orgName: unit.building.org.name,
          ownerId: unit.ownerId,
          unitId: unit.id,
          buildingId: unit.building.id,
          buildingName: unit.building.name,
          unitLabel: unit.label,
        })),
    ];

    const deduped = new Map<string, PortfolioUnitRow>();
    for (const row of rows) {
      deduped.set(row.unitId, row);
    }

    return Array.from(deduped.values()).sort((a, b) => {
      if (a.orgName !== b.orgName) {
        return a.orgName.localeCompare(b.orgName);
      }
      if (a.buildingName !== b.buildingName) {
        return a.buildingName.localeCompare(b.buildingName);
      }
      if (a.unitLabel !== b.unitLabel) {
        return a.unitLabel.localeCompare(b.unitLabel);
      }
      return a.unitId.localeCompare(b.unitId);
    });
  }

  private async getAccessibleUnitScopeMap(userId: string) {
    const scope = await this.loadAccessibleUnitScope(userId);
    return scope.map;
  }

  private async getAccessibleRequestRowByIdOrThrow(
    userId: string,
    requestId: string,
  ): Promise<PortfolioRequestRowWithoutContext> {
    const unitScope = await this.getAccessibleUnitScopeMap(userId);
    if (unitScope.size === 0) {
      throw new NotFoundException('Request not found');
    }

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: {
        id: requestId,
        unitId: {
          in: Array.from(unitScope.keys()),
        },
      },
      include: accessibleRequestInclude,
    });

    if (!request?.unitId) {
      throw new NotFoundException('Request not found');
    }

    const unit = unitScope.get(request.unitId);
    if (!unit) {
      throw new NotFoundException('Request not found');
    }

    return this.mapAccessibleRequest(request, unit);
  }

  private async listAccessibleRequestIds(userId: string) {
    const unitScope = await this.getAccessibleUnitScopeMap(userId);
    if (unitScope.size === 0) {
      return [];
    }

    const requests = await this.prisma.maintenanceRequest.findMany({
      where: {
        unitId: {
          in: Array.from(unitScope.keys()),
        },
      },
      select: {
        id: true,
      },
    });

    return requests.map((request) => request.id);
  }

  private async markAccessibleRequestCommentsRead(
    userId: string,
    requestId: string,
    lastReadAt: Date,
  ) {
    await this.prisma.ownerRequestCommentReadState.upsert({
      where: {
        userId_requestId: {
          userId,
          requestId,
        },
      },
      update: {
        lastReadAt,
      },
      create: {
        userId,
        requestId,
        lastReadAt,
      },
    });
  }

  private mapAccessibleRequest(
    request: AccessibleMaintenanceRequest,
    unit: Pick<
      PortfolioRequestRow,
      | 'orgId'
      | 'orgName'
      | 'ownerId'
      | 'buildingId'
      | 'buildingName'
      | 'unitId'
      | 'unitLabel'
    >,
  ): PortfolioRequestRowWithoutContext {
    return {
      id: request.id,
      orgId: unit.orgId,
      orgName: unit.orgName,
      ownerId: unit.ownerId,
      buildingId: unit.buildingId,
      buildingName: unit.buildingName,
      unitId: unit.unitId,
      unitLabel: unit.unitLabel,
      title: request.title,
      description: request.description ?? null,
      status: request.status,
      priority: request.priority ?? null,
      type: request.type ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      createdBy: {
        id: request.createdByUser.id,
        name: request.createdByUser.name ?? null,
        email: request.createdByUser.email,
      },
      assignedTo: request.assignedToUser
        ? {
            id: request.assignedToUser.id,
            name: request.assignedToUser.name ?? null,
            email: request.assignedToUser.email,
          }
        : null,
      attachments: request.attachments,
      ownerApprovalStatus: request.ownerApprovalStatus,
      ownerApprovalRequestedAt: request.ownerApprovalRequestedAt ?? null,
      ownerApprovalRequestedByUserId:
        request.ownerApprovalRequestedByUserId ?? null,
      ownerApprovalDeadlineAt: request.ownerApprovalDeadlineAt ?? null,
      ownerApprovalDecidedAt: request.ownerApprovalDecidedAt ?? null,
      ownerApprovalDecidedByOwnerUserId:
        request.ownerApprovalDecidedByOwnerUserId ?? null,
      ownerApprovalReason: request.ownerApprovalReason ?? null,
      approvalRequiredReason: request.approvalRequiredReason ?? null,
      estimatedAmount: request.estimatedAmount?.toString() ?? null,
      estimatedCurrency: request.estimatedCurrency ?? null,
      isEmergency: request.isEmergency ?? false,
      ownerApprovalDecisionSource: request.ownerApprovalDecisionSource ?? null,
      ownerApprovalOverrideReason: request.ownerApprovalOverrideReason ?? null,
      ownerApprovalOverriddenByUserId:
        request.ownerApprovalOverriddenByUserId ?? null,
      occupancyIdAtCreation: request.occupancyIdAtCreation ?? null,
      leaseIdAtCreation: request.leaseIdAtCreation ?? null,
    };
  }

  private async withRequesterContext(
    request: PortfolioRequestRowWithoutContext,
  ) {
    const [contextByRequestId, tenancyContextByRequestId] = await Promise.all([
      buildRequesterContextMap(this.prisma, [
        {
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdBy.id,
          unitId: request.unitId,
        },
      ]),
      buildRequestTenancyContextMap(this.prisma, [
        {
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdBy.id,
          createdAt: request.createdAt,
          buildingId: request.buildingId,
          unitId: request.unitId,
          occupancyIdAtCreation: request.occupancyIdAtCreation ?? null,
          leaseIdAtCreation: request.leaseIdAtCreation ?? null,
        },
      ]),
    ]);

    return {
      ...request,
      requesterContext: getRequesterContextOrDefault(
        contextByRequestId,
        request.id,
      ),
      requestTenancyContext: getRequestTenancyContextOrDefault(
        tenancyContextByRequestId,
        request.id,
      ),
    };
  }

  private async withRequesterContextList(
    requests: PortfolioRequestRowWithoutContext[],
  ) {
    if (requests.length === 0) {
      return [];
    }

    const [contextByRequestId, tenancyContextByRequestId] = await Promise.all([
      buildRequesterContextMap(
        this.prisma,
        requests.map((request) => ({
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdBy.id,
          unitId: request.unitId,
        })),
      ),
      buildRequestTenancyContextMap(
        this.prisma,
        requests.map((request) => ({
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdBy.id,
          createdAt: request.createdAt,
          buildingId: request.buildingId,
          unitId: request.unitId,
          occupancyIdAtCreation: request.occupancyIdAtCreation ?? null,
          leaseIdAtCreation: request.leaseIdAtCreation ?? null,
        })),
      ),
    ]);

    return requests.map((request) => ({
      ...request,
      requesterContext: getRequesterContextOrDefault(
        contextByRequestId,
        request.id,
      ),
      requestTenancyContext: getRequestTenancyContextOrDefault(
        tenancyContextByRequestId,
        request.id,
      ),
    }));
  }

  private toEventRequest(
    request: PortfolioRequestRow,
  ): MaintenanceRequestEventPayload['request'] {
    return {
      id: request.id,
      orgId: request.orgId,
      buildingId: request.buildingId,
      unitId: request.unitId,
      title: request.title,
      status: request.status,
      ownerApprovalStatus: request.ownerApprovalStatus,
      createdByUserId: request.createdBy.id,
      assignedToUserId: request.assignedTo?.id ?? null,
      isEmergency: request.isEmergency,
      unit: {
        id: request.unitId,
        label: request.unitLabel,
      },
    };
  }

  private emitEvent(
    eventName: string,
    payload: MaintenanceRequestEventPayload,
  ) {
    this.eventEmitter.emit(eventName, payload);
  }
}

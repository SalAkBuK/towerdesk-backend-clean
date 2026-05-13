import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import {
  MaintenanceRequestOwnerApprovalDecisionSource,
  MaintenanceRequestOwnerApprovalStatus,
  OwnerAccessGrantStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { OwnerPortfolioGuard } from '../src/common/guards/owner-portfolio.guard';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { BuildingRequestsController } from '../src/modules/maintenance-requests/building-requests.controller';
import {
  MaintenanceRequestOwnerApprovalDecisionSourceEnum,
  MaintenanceRequestOwnerApprovalStatusEnum,
  MaintenanceRequestStatusEnum,
} from '../src/modules/maintenance-requests/maintenance-requests.constants';
import { MaintenanceRequestsRepo } from '../src/modules/maintenance-requests/maintenance-requests.repo';
import { MaintenanceRequestsService } from '../src/modules/maintenance-requests/maintenance-requests.service';
import { OwnerPortfolioController } from '../src/modules/owner-portfolio/owner-portfolio.controller';
import { OwnerPortfolioScopeService } from '../src/modules/owner-portfolio/owner-portfolio-scope.service';
import { ProviderAccessService } from '../src/modules/service-providers/provider-access.service';

type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  orgId: string | null;
  isActive: boolean;
};

type OrgRecord = {
  id: string;
  name: string;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
};

type OwnerRecord = {
  id: string;
  orgId: string;
  partyId: string | null;
  isActive: boolean;
};

type OwnerAccessGrantRecord = {
  id: string;
  userId: string | null;
  ownerId: string;
  status: OwnerAccessGrantStatus;
};

type BuildingAssignmentRecord = {
  id: string;
  buildingId: string;
  userId: string;
  type: 'MANAGER' | 'STAFF' | 'BUILDING_ADMIN';
  createdAt: Date;
  updatedAt: Date;
};

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
  ownerId: string | null;
  floor: number | null;
};

type UnitOwnershipRecord = {
  id: string;
  orgId: string;
  unitId: string;
  ownerId: string;
  startDate: Date;
  endDate: Date | null;
  isPrimary: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LeaseRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId: string;
  occupancyId: string | null;
  residentUserId: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  leaseStartDate: Date | null;
  leaseEndDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ResidentProfileRecord = {
  orgId: string;
  userId: string;
};

type ResidentInviteRecord = {
  id: string;
  orgId: string;
  userId: string;
  status: 'SENT' | 'FAILED' | 'ACCEPTED';
  expiresAt: Date;
  sentAt: Date;
};

type MaintenanceRequestRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId: string | null;
  createdByUserId: string;
  title: string;
  description: string | null;
  status: string;
  type: string | null;
  priority: string | null;
  assignedToUserId: string | null;
  estimateStatus: string;
  estimateRequestedAt: Date | null;
  estimateRequestedByUserId: string | null;
  estimateDueAt: Date | null;
  estimateReminderSentAt: Date | null;
  estimateSubmittedAt: Date | null;
  estimateSubmittedByUserId: string | null;
  assignedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus;
  ownerApprovalRequestedAt: Date | null;
  ownerApprovalRequestedByUserId: string | null;
  ownerApprovalDeadlineAt: Date | null;
  ownerApprovalDecidedAt: Date | null;
  ownerApprovalDecidedByOwnerUserId: string | null;
  ownerApprovalReason: string | null;
  approvalRequiredReason: string | null;
  estimatedAmount: Prisma.Decimal | null;
  estimatedCurrency: string | null;
  isEmergency: boolean;
  isLikeForLike: boolean | null;
  isUpgrade: boolean | null;
  isMajorReplacement: boolean | null;
  isResponsibilityDisputed: boolean | null;
  ownerApprovalDecisionSource: MaintenanceRequestOwnerApprovalDecisionSource | null;
  ownerApprovalOverrideReason: string | null;
  ownerApprovalOverriddenByUserId: string | null;
};

type MaintenanceRequestAttachmentRecord = {
  id: string;
  requestId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
};

type OwnerApprovalAuditRecord = {
  id: string;
  requestId: string;
  orgId: string;
  actorUserId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  decisionSource: string | null;
  reason: string | null;
  createdAt: Date;
};

let prisma: InMemoryPrismaService;
const accessPermissionsByUser = new Map<string, Set<string>>();

class InMemoryPrismaService {
  private users: UserRecord[] = [];
  private orgs: OrgRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private owners: OwnerRecord[] = [];
  private grants: OwnerAccessGrantRecord[] = [];
  private buildingAssignments: BuildingAssignmentRecord[] = [];
  private units: UnitRecord[] = [];
  private ownerships: UnitOwnershipRecord[] = [];
  private occupancies: OccupancyRecord[] = [];
  private leases: LeaseRecord[] = [];
  private residentProfiles: ResidentProfileRecord[] = [];
  private residentInvites: ResidentInviteRecord[] = [];
  private requests: MaintenanceRequestRecord[] = [];
  private attachments: MaintenanceRequestAttachmentRecord[] = [];
  private ownerApprovalAudits: OwnerApprovalAuditRecord[] = [];

  user = {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; email?: string };
    }) => {
      if (where.id) {
        return this.users.find((user) => user.id === where.id) ?? null;
      }
      if (where.email) {
        return this.users.find((user) => user.email === where.email) ?? null;
      }
      return null;
    },
  };

  building = {
    findFirst: async ({
      where,
    }: {
      where: { id: string; orgId: string };
    }) => {
      return (
        this.buildings.find(
          (building) =>
            building.id === where.id && building.orgId === where.orgId,
        ) ?? null
      );
    },
  };

  occupancy = {
    findMany: async (_args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
    }) => {
      return [];
    },
  };

  lease = {
    findMany: async (_args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
    }) => {
      return [];
    },
  };

  residentProfile = {
    findMany: async (_args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    }) => {
      return [];
    },
  };

  residentInvite = {
    findMany: async (_args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
    }) => {
      return [];
    },
  };

  ownerAccessGrant = {
    findFirst: async ({
      where,
      select,
    }: {
      where: {
        userId: string;
        status: OwnerAccessGrantStatus;
        owner?: { isActive?: boolean };
      };
      select?: { id?: boolean };
    }) => {
      const grant = this.grants.find((item) =>
        this.matchesGrantOwnerScope(item, where),
      );
      if (!grant) {
        return null;
      }
      if (!select) {
        return grant;
      }
      return {
        ...(select.id ? { id: grant.id } : {}),
      };
    },
    findMany: async ({
      where,
      select,
    }: {
      where: {
        userId: string;
        status: OwnerAccessGrantStatus;
        owner?: { isActive?: boolean };
      };
      select?: { ownerId?: boolean };
    }) => {
      const grants = this.grants.filter((item) =>
        this.matchesGrantOwnerScope(item, where),
      );
      if (!select) {
        return grants;
      }
      return grants.map((grant) => ({
        ...(select.ownerId ? { ownerId: grant.ownerId } : {}),
      }));
    },
  };

  userAccessAssignment = {
    findMany: async ({
      where,
      include,
    }: {
      where: {
        userId?: string;
        scopeType?: 'ORG' | 'BUILDING';
        scopeId?: string | null;
        roleTemplate?: {
          orgId?: string;
          scopeType?: 'ORG' | 'BUILDING';
        };
      };
      include?: {
        roleTemplate?: {
          include?: {
            rolePermissions?: {
              include?: { permission?: boolean };
            };
          };
        };
        user?: boolean;
      };
    }) => {
      const records = this.buildingAssignments
        .filter((assignment) => {
          if (where.userId && assignment.userId !== where.userId) {
            return false;
          }
          if (where.scopeType !== undefined && where.scopeType !== 'BUILDING') {
            return false;
          }
          if (
            where.scopeId !== undefined &&
            assignment.buildingId !== where.scopeId
          ) {
            return false;
          }
          const building = this.buildings.find(
            (candidate) => candidate.id === assignment.buildingId,
          );
          if (!building) {
            return false;
          }
          if (
            where.roleTemplate?.orgId &&
            building.orgId !== where.roleTemplate.orgId
          ) {
            return false;
          }
          if (
            where.roleTemplate?.scopeType !== undefined &&
            where.roleTemplate.scopeType !== 'BUILDING'
          ) {
            return false;
          }
          return true;
        })
        .map((assignment) => {
          const building = this.buildings.find(
            (candidate) => candidate.id === assignment.buildingId,
          )!;
          const roleTemplateKey =
            assignment.type === 'MANAGER'
              ? 'building_manager'
              : assignment.type === 'BUILDING_ADMIN'
                ? 'building_admin'
                : 'building_staff';
          const rolePermissionKeys =
            assignment.type === 'STAFF'
              ? ['requests.read', 'requests.comment', 'requests.update_status']
              : [
                  'requests.read',
                  'requests.assign',
                  'requests.comment',
                  'requests.update_status',
                ];

          return {
            id: randomUUID(),
            userId: assignment.userId,
            scopeType: 'BUILDING' as const,
            scopeId: assignment.buildingId,
            roleTemplate: {
              id: randomUUID(),
              orgId: building.orgId,
              key: roleTemplateKey,
              scopeType: 'BUILDING' as const,
              rolePermissions: rolePermissionKeys.map((key) => ({
                permission: { key },
              })),
            },
            createdAt: assignment.createdAt,
          };
        });

      return records.map((record) => ({
        ...record,
        roleTemplate: include?.roleTemplate ? record.roleTemplate : undefined,
        user: include?.user
          ? this.users.find((user) => user.id === record.userId) ?? null
          : undefined,
      }));
    },
  };

  unitOwnership = {
    findMany: async ({
      where,
      include,
      orderBy,
    }: {
      where: {
        ownerId?: { in: string[] };
        unitId?: string;
        endDate: Date | null;
        owner?: {
          isActive?: boolean;
          accessGrants?: {
            some: {
              userId: string;
              status: OwnerAccessGrantStatus;
            };
          };
        };
      };
      include?: {
        org?: { select: { id: true; name: true } };
        unit?: {
          select: {
            id: true;
            label: true;
            building: {
              select: { id: true; name: true };
            };
          };
        };
      };
      orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      let rows = this.ownerships.filter((row) => {
        if (where.endDate === null && row.endDate !== null) {
          return false;
        }
        if (where.ownerId?.in && !where.ownerId.in.includes(row.ownerId)) {
          return false;
        }
        if (where.unitId && row.unitId !== where.unitId) {
          return false;
        }

        const owner = this.owners.find((item) => item.id === row.ownerId);
        if (!owner) {
          return false;
        }
        if (
          where.owner?.isActive !== undefined &&
          owner.isActive !== where.owner.isActive
        ) {
          return false;
        }
        const grantScope = where.owner?.accessGrants?.some;
        if (grantScope) {
          const hasGrant = this.grants.some(
            (grant) =>
              grant.ownerId === owner.id &&
              grant.userId === grantScope.userId &&
              grant.status === grantScope.status,
          );
          if (!hasGrant) {
            return false;
          }
        }
        return true;
      });

      if (orderBy?.length) {
        rows = rows.slice().sort((a, b) => {
          for (const ordering of orderBy) {
            if (ordering.createdAt) {
              if (a.createdAt.getTime() !== b.createdAt.getTime()) {
                return ordering.createdAt === 'asc'
                  ? a.createdAt.getTime() - b.createdAt.getTime()
                  : b.createdAt.getTime() - a.createdAt.getTime();
              }
            }
            if (ordering.id) {
              if (a.id !== b.id) {
                return ordering.id === 'asc'
                  ? a.id.localeCompare(b.id)
                  : b.id.localeCompare(a.id);
              }
            }
          }
          return 0;
        });
      }

      if (!include) {
        return rows;
      }

      return rows.map((row) => {
        const org = this.orgs.find((item) => item.id === row.orgId);
        const unit = this.units.find((item) => item.id === row.unitId);
        const building = unit
          ? this.buildings.find((item) => item.id === unit.buildingId)
          : null;

        return {
          ...row,
          ...(include.org && org
            ? {
                org: { id: org.id, name: org.name },
              }
            : {}),
          ...(include.unit && unit && building
            ? {
                unit: {
                  id: unit.id,
                  label: unit.label,
                  building: {
                    id: building.id,
                    name: building.name,
                  },
                },
              }
            : {}),
        };
      });
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        unitId: string;
        endDate: Date | null;
        ownerId?: { not: string };
      };
      data: { endDate: Date };
    }) => {
      let count = 0;
      for (const row of this.ownerships) {
        if (row.unitId !== where.unitId || row.endDate !== where.endDate) {
          continue;
        }
        if (where.ownerId?.not && row.ownerId === where.ownerId.not) {
          continue;
        }
        row.endDate = data.endDate;
        row.updatedAt = new Date();
        count += 1;
      }
      return { count };
    },
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        unitId: string;
        ownerId: string;
        startDate: Date;
        endDate: Date | null;
        isPrimary: boolean;
      };
    }) => {
      const now = new Date();
      const created: UnitOwnershipRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        unitId: data.unitId,
        ownerId: data.ownerId,
        startDate: data.startDate,
        endDate: data.endDate,
        isPrimary: data.isPrimary,
        createdAt: now,
        updatedAt: now,
      };
      this.ownerships.push(created);
      return created;
    },
  };

  unit = {
    findMany: async ({
      where,
    }: {
      where: {
        id?: string;
        ownerId: { in: string[] };
        owner: {
          isActive: boolean;
          accessGrants: {
            some: {
              userId: string;
              status: OwnerAccessGrantStatus;
            };
          };
        };
        ownerships: {
          none: {
            endDate: Date | null;
          };
        };
      };
      select: {
        id: true;
        label: true;
        ownerId: true;
        building: {
          select: {
            id: true;
            name: true;
            org: {
              select: { id: true; name: true };
            };
          };
        };
      };
    }) => {
      return this.units
        .filter((unit) => {
          if (where.id && unit.id !== where.id) {
            return false;
          }
          if (!unit.ownerId || !where.ownerId.in.includes(unit.ownerId)) {
            return false;
          }
          const owner = this.owners.find((item) => item.id === unit.ownerId);
          if (!owner || owner.isActive !== where.owner.isActive) {
            return false;
          }

          const hasGrant = this.grants.some(
            (grant) =>
              grant.ownerId === owner.id &&
              grant.userId === where.owner.accessGrants.some.userId &&
              grant.status === where.owner.accessGrants.some.status,
          );
          if (!hasGrant) {
            return false;
          }

          const hasActiveOwnership = this.ownerships.some(
            (row) => row.unitId === unit.id && row.endDate === null,
          );
          return !hasActiveOwnership;
        })
        .map((unit) => {
          const building = this.buildings.find(
            (item) => item.id === unit.buildingId,
          );
          if (!building) {
            throw new Error('Missing building');
          }
          const org = this.orgs.find((item) => item.id === building.orgId);
          if (!org) {
            throw new Error('Missing org');
          }
          return {
            id: unit.id,
            label: unit.label,
            ownerId: unit.ownerId,
            building: {
              id: building.id,
              name: building.name,
              org: {
                id: org.id,
                name: org.name,
              },
            },
          };
        });
    },
  };

  maintenanceRequest = {
    findMany: async ({
      where,
      include,
      orderBy,
    }: {
      where: {
        orgId?: string;
        buildingId?: string;
        createdByUserId?: string;
        assignedToUserId?: string;
        status?: string;
        unitId?: { in: string[] };
      };
      include?: {
        unit?: boolean;
        createdByUser?:
          | boolean
          | { select: { id: true; name: true; email: true } };
        assignedToUser?:
          | boolean
          | { select: { id: true; name: true; email: true } };
        attachments?:
          | boolean
          | {
              select: {
                id: true;
                fileName: true;
                mimeType: true;
                sizeBytes: true;
                url: true;
                createdAt: true;
              };
            };
      };
      orderBy?:
        | { createdAt: 'desc' }
        | Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      let rows = this.requests.slice();

      if (where.orgId) {
        rows = rows.filter((request) => request.orgId === where.orgId);
      }
      if (where.buildingId) {
        rows = rows.filter(
          (request) => request.buildingId === where.buildingId,
        );
      }
      if (where.createdByUserId) {
        rows = rows.filter(
          (request) => request.createdByUserId === where.createdByUserId,
        );
      }
      if (where.assignedToUserId) {
        rows = rows.filter(
          (request) => request.assignedToUserId === where.assignedToUserId,
        );
      }
      if (where.status) {
        rows = rows.filter((request) => request.status === where.status);
      }
      if (where.unitId?.in) {
        rows = rows.filter(
          (request) =>
            request.unitId !== null && where.unitId!.in.includes(request.unitId),
        );
      }

      if (Array.isArray(orderBy)) {
        rows = rows.slice().sort((a, b) => {
          for (const ordering of orderBy) {
            if (ordering.createdAt) {
              if (a.createdAt.getTime() !== b.createdAt.getTime()) {
                return ordering.createdAt === 'asc'
                  ? a.createdAt.getTime() - b.createdAt.getTime()
                  : b.createdAt.getTime() - a.createdAt.getTime();
              }
            }
            if (ordering.id) {
              if (a.id !== b.id) {
                return ordering.id === 'asc'
                  ? a.id.localeCompare(b.id)
                  : b.id.localeCompare(a.id);
              }
            }
          }
          return 0;
        });
      } else if (orderBy?.createdAt === 'desc') {
        rows = rows
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }

      return rows.map((request) => this.hydrateRequest(request, include));
    },
    findFirst: async ({
      where,
      include,
    }: {
      where: {
        id: string;
        orgId?: string;
        buildingId?: string;
        createdByUserId?: string;
        unitId?: { in: string[] };
      };
      include?: {
        unit?: boolean;
        createdByUser?:
          | boolean
          | { select: { id: true; name: true; email: true } };
        assignedToUser?:
          | boolean
          | { select: { id: true; name: true; email: true } };
        attachments?:
          | boolean
          | {
              select: {
                id: true;
                fileName: true;
                mimeType: true;
                sizeBytes: true;
                url: true;
                createdAt: true;
              };
            };
      };
    }) => {
      const request =
        this.requests.find(
          (item) =>
            item.id === where.id &&
            (where.orgId ? item.orgId === where.orgId : true) &&
            (where.buildingId ? item.buildingId === where.buildingId : true) &&
            (where.createdByUserId
              ? item.createdByUserId === where.createdByUserId
              : true) &&
            (where.unitId?.in
              ? item.unitId !== null && where.unitId.in.includes(item.unitId)
              : true),
        ) ?? null;
      if (!request) {
        return null;
      }
      return this.hydrateRequest(request, include);
    },
    update: async ({
      where,
      data,
      include,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
      include?: {
        unit?: boolean;
        createdByUser?:
          | boolean
          | { select: { id: true; name: true; email: true } };
        assignedToUser?:
          | boolean
          | { select: { id: true; name: true; email: true } };
        attachments?:
          | boolean
          | {
              select: {
                id: true;
                fileName: true;
                mimeType: true;
                sizeBytes: true;
                url: true;
                createdAt: true;
              };
            };
      };
    }) => {
      const request = this.requests.find((item) => item.id === where.id);
      if (!request) {
        throw new Error('Request not found');
      }

      if (data.title !== undefined) {
        request.title = data.title as string;
      }
      if (data.description !== undefined) {
        request.description = (data.description as string | null) ?? null;
      }
      if (data.status !== undefined) {
        request.status = data.status as string;
      }
      if (data.assignedAt !== undefined) {
        request.assignedAt = (data.assignedAt as Date | null) ?? null;
      }
      if (data.completedAt !== undefined) {
        request.completedAt = (data.completedAt as Date | null) ?? null;
      }
      if (data.canceledAt !== undefined) {
        request.canceledAt = (data.canceledAt as Date | null) ?? null;
      }
      if (data.assignedToUser !== undefined) {
        const relation = data.assignedToUser as
          | { connect?: { id: string } }
          | { disconnect?: true };
        if ('connect' in relation && relation.connect) {
          request.assignedToUserId = relation.connect.id;
        }
        if ('disconnect' in relation && relation.disconnect) {
          request.assignedToUserId = null;
        }
      }
      if (data.estimateStatus !== undefined) {
        request.estimateStatus = data.estimateStatus as string;
      }
      if (data.estimateRequestedAt !== undefined) {
        request.estimateRequestedAt =
          (data.estimateRequestedAt as Date | null) ?? null;
      }
      if (data.estimateRequestedByUser !== undefined) {
        const relation = data.estimateRequestedByUser as
          | { connect?: { id: string } }
          | { disconnect?: true };
        if ('connect' in relation && relation.connect) {
          request.estimateRequestedByUserId = relation.connect.id;
        }
        if ('disconnect' in relation && relation.disconnect) {
          request.estimateRequestedByUserId = null;
        }
      }
      if (data.estimateDueAt !== undefined) {
        request.estimateDueAt = (data.estimateDueAt as Date | null) ?? null;
      }
      if (data.estimateReminderSentAt !== undefined) {
        request.estimateReminderSentAt =
          (data.estimateReminderSentAt as Date | null) ?? null;
      }
      if (data.estimateSubmittedAt !== undefined) {
        request.estimateSubmittedAt =
          (data.estimateSubmittedAt as Date | null) ?? null;
      }
      if (data.estimateSubmittedByUser !== undefined) {
        const relation = data.estimateSubmittedByUser as
          | { connect?: { id: string } }
          | { disconnect?: true };
        if ('connect' in relation && relation.connect) {
          request.estimateSubmittedByUserId = relation.connect.id;
        }
        if ('disconnect' in relation && relation.disconnect) {
          request.estimateSubmittedByUserId = null;
        }
      }

      if (data.ownerApprovalStatus !== undefined) {
        request.ownerApprovalStatus =
          data.ownerApprovalStatus as MaintenanceRequestOwnerApprovalStatus;
      }
      if (data.ownerApprovalRequestedAt !== undefined) {
        request.ownerApprovalRequestedAt =
          (data.ownerApprovalRequestedAt as Date | null) ?? null;
      }
      if (data.ownerApprovalRequestedByUser !== undefined) {
        const relation = data.ownerApprovalRequestedByUser as
          | { connect?: { id: string } }
          | { disconnect?: true };
        if ('connect' in relation && relation.connect) {
          request.ownerApprovalRequestedByUserId = relation.connect.id;
        }
        if ('disconnect' in relation && relation.disconnect) {
          request.ownerApprovalRequestedByUserId = null;
        }
      }
      if (data.ownerApprovalDeadlineAt !== undefined) {
        request.ownerApprovalDeadlineAt =
          (data.ownerApprovalDeadlineAt as Date | null) ?? null;
      }
      if (data.ownerApprovalDecidedAt !== undefined) {
        request.ownerApprovalDecidedAt =
          (data.ownerApprovalDecidedAt as Date | null) ?? null;
      }
      if (data.ownerApprovalDecidedByOwnerUser !== undefined) {
        const relation = data.ownerApprovalDecidedByOwnerUser as
          | { connect?: { id: string } }
          | { disconnect?: true };
        if ('connect' in relation && relation.connect) {
          request.ownerApprovalDecidedByOwnerUserId = relation.connect.id;
        }
        if ('disconnect' in relation && relation.disconnect) {
          request.ownerApprovalDecidedByOwnerUserId = null;
        }
      }
      if (data.ownerApprovalReason !== undefined) {
        request.ownerApprovalReason =
          (data.ownerApprovalReason as string | null) ?? null;
      }
      if (data.approvalRequiredReason !== undefined) {
        request.approvalRequiredReason =
          (data.approvalRequiredReason as string | null) ?? null;
      }
      if (data.estimatedAmount !== undefined) {
        request.estimatedAmount =
          (data.estimatedAmount as Prisma.Decimal | null) ?? null;
      }
      if (data.estimatedCurrency !== undefined) {
        request.estimatedCurrency =
          (data.estimatedCurrency as string | null) ?? null;
      }
      if (data.isEmergency !== undefined) {
        request.isEmergency = Boolean(data.isEmergency);
      }
      if (data.isLikeForLike !== undefined) {
        request.isLikeForLike = (data.isLikeForLike as boolean | null) ?? null;
      }
      if (data.isUpgrade !== undefined) {
        request.isUpgrade = (data.isUpgrade as boolean | null) ?? null;
      }
      if (data.isMajorReplacement !== undefined) {
        request.isMajorReplacement =
          (data.isMajorReplacement as boolean | null) ?? null;
      }
      if (data.isResponsibilityDisputed !== undefined) {
        request.isResponsibilityDisputed =
          (data.isResponsibilityDisputed as boolean | null) ?? null;
      }
      if (data.ownerApprovalDecisionSource !== undefined) {
        request.ownerApprovalDecisionSource =
          (data.ownerApprovalDecisionSource as MaintenanceRequestOwnerApprovalDecisionSource | null) ??
          null;
      }
      if (data.ownerApprovalOverrideReason !== undefined) {
        request.ownerApprovalOverrideReason =
          (data.ownerApprovalOverrideReason as string | null) ?? null;
      }
      if (data.ownerApprovalOverriddenByUser !== undefined) {
        const relation = data.ownerApprovalOverriddenByUser as
          | { connect?: { id: string } }
          | { disconnect?: true };
        if ('connect' in relation && relation.connect) {
          request.ownerApprovalOverriddenByUserId = relation.connect.id;
        }
        if ('disconnect' in relation && relation.disconnect) {
          request.ownerApprovalOverriddenByUserId = null;
        }
      }

      request.updatedAt = new Date();
      return this.hydrateRequest(request, include);
    },
  };

  maintenanceRequestOwnerApprovalAudit = {
    create: async ({
      data,
    }: {
      data: {
        requestId: string;
        orgId: string;
        actorUserId: string;
        action: string;
        fromStatus?: string | null;
        toStatus: string;
        decisionSource?: string | null;
        reason?: string | null;
      };
    }) => {
      const created: OwnerApprovalAuditRecord = {
        id: randomUUID(),
        requestId: data.requestId,
        orgId: data.orgId,
        actorUserId: data.actorUserId,
        action: data.action,
        fromStatus: data.fromStatus ?? null,
        toStatus: data.toStatus,
        decisionSource: data.decisionSource ?? null,
        reason: data.reason ?? null,
        createdAt: new Date(),
      };
      this.ownerApprovalAudits.push(created);
      return created;
    },
  };

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]) {
    if (Array.isArray(arg)) {
      return Promise.all(arg) as Promise<T>;
    }
    return arg(this);
  }

  reset() {
    this.users = [];
    this.orgs = [];
    this.buildings = [];
    this.owners = [];
    this.grants = [];
    this.buildingAssignments = [];
    this.units = [];
    this.ownerships = [];
    this.requests = [];
    this.attachments = [];
    this.ownerApprovalAudits = [];
  }

  seedOrg(name: string) {
    const created: OrgRecord = {
      id: randomUUID(),
      name,
    };
    this.orgs.push(created);
    return created;
  }

  seedUser(input: {
    email: string;
    name?: string | null;
    orgId: string | null;
    isActive?: boolean;
  }) {
    const created: UserRecord = {
      id: randomUUID(),
      email: input.email,
      name: input.name ?? null,
      orgId: input.orgId,
      isActive: input.isActive ?? true,
    };
    this.users.push(created);
    return created;
  }

  seedBuilding(input: { orgId: string; name: string }) {
    const created: BuildingRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      name: input.name,
    };
    this.buildings.push(created);
    return created;
  }

  seedOwner(input: {
    orgId: string;
    partyId?: string | null;
    isActive?: boolean;
  }) {
    const created: OwnerRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      partyId: input.partyId ?? null,
      isActive: input.isActive ?? true,
    };
    this.owners.push(created);
    return created;
  }

  seedGrant(input: {
    userId: string;
    ownerId: string;
    status: OwnerAccessGrantStatus;
  }) {
    const created: OwnerAccessGrantRecord = {
      id: randomUUID(),
      userId: input.userId,
      ownerId: input.ownerId,
      status: input.status,
    };
    this.grants.push(created);
    return created;
  }

  seedBuildingAssignment(input: {
    buildingId: string;
    userId: string;
    type: 'MANAGER' | 'STAFF' | 'BUILDING_ADMIN';
  }) {
    const now = new Date();
    const created: BuildingAssignmentRecord = {
      id: randomUUID(),
      buildingId: input.buildingId,
      userId: input.userId,
      type: input.type,
      createdAt: now,
      updatedAt: now,
    };
    this.buildingAssignments.push(created);
    return created;
  }

  seedUnit(input: {
    buildingId: string;
    label: string;
    ownerId?: string | null;
  }) {
    const created: UnitRecord = {
      id: randomUUID(),
      buildingId: input.buildingId,
      label: input.label,
      ownerId: input.ownerId ?? null,
      floor: null,
    };
    this.units.push(created);
    return created;
  }

  seedOwnership(input: {
    orgId: string;
    unitId: string;
    ownerId: string;
    endDate?: Date | null;
  }) {
    const now = new Date();
    const created: UnitOwnershipRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      unitId: input.unitId,
      ownerId: input.ownerId,
      startDate: now,
      endDate: input.endDate ?? null,
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
    };
    this.ownerships.push(created);
    return created;
  }

  seedRequest(input: {
    orgId: string;
    buildingId: string;
    unitId: string;
    createdByUserId: string;
    title: string;
    description?: string | null;
    status?: string;
    type?: string | null;
    priority?: string | null;
    assignedToUserId?: string | null;
    ownerApprovalStatus?: MaintenanceRequestOwnerApprovalStatus;
    estimateStatus?: string;
    estimateRequestedAt?: Date | null;
    estimateRequestedByUserId?: string | null;
    estimateDueAt?: Date | null;
    estimateReminderSentAt?: Date | null;
    estimateSubmittedAt?: Date | null;
    estimateSubmittedByUserId?: string | null;
    ownerApprovalRequestedAt?: Date | null;
    ownerApprovalRequestedByUserId?: string | null;
    ownerApprovalDeadlineAt?: Date | null;
    ownerApprovalDecidedAt?: Date | null;
    ownerApprovalDecidedByOwnerUserId?: string | null;
    ownerApprovalReason?: string | null;
    approvalRequiredReason?: string | null;
    estimatedAmount?: number | string | Prisma.Decimal | null;
    estimatedCurrency?: string | null;
    isEmergency?: boolean;
    isLikeForLike?: boolean | null;
    isUpgrade?: boolean | null;
    isMajorReplacement?: boolean | null;
    isResponsibilityDisputed?: boolean | null;
    ownerApprovalDecisionSource?: MaintenanceRequestOwnerApprovalDecisionSource | null;
    ownerApprovalOverrideReason?: string | null;
    ownerApprovalOverriddenByUserId?: string | null;
  }) {
    const now = new Date();
    const created: MaintenanceRequestRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      buildingId: input.buildingId,
      unitId: input.unitId,
      createdByUserId: input.createdByUserId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? MaintenanceRequestStatusEnum.OPEN,
      type: input.type ?? null,
      priority: input.priority ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      estimateStatus: input.estimateStatus ?? 'NOT_REQUESTED',
      estimateRequestedAt: input.estimateRequestedAt ?? null,
      estimateRequestedByUserId: input.estimateRequestedByUserId ?? null,
      estimateDueAt: input.estimateDueAt ?? null,
      estimateReminderSentAt: input.estimateReminderSentAt ?? null,
      estimateSubmittedAt: input.estimateSubmittedAt ?? null,
      estimateSubmittedByUserId: input.estimateSubmittedByUserId ?? null,
      assignedAt: null,
      completedAt: null,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
      ownerApprovalStatus:
        input.ownerApprovalStatus ??
        MaintenanceRequestOwnerApprovalStatus.NOT_REQUIRED,
      ownerApprovalRequestedAt: input.ownerApprovalRequestedAt ?? null,
      ownerApprovalRequestedByUserId:
        input.ownerApprovalRequestedByUserId ?? null,
      ownerApprovalDeadlineAt: input.ownerApprovalDeadlineAt ?? null,
      ownerApprovalDecidedAt: input.ownerApprovalDecidedAt ?? null,
      ownerApprovalDecidedByOwnerUserId:
        input.ownerApprovalDecidedByOwnerUserId ?? null,
      ownerApprovalReason: input.ownerApprovalReason ?? null,
      approvalRequiredReason: input.approvalRequiredReason ?? null,
      estimatedAmount:
        input.estimatedAmount === undefined || input.estimatedAmount === null
          ? null
          : new Prisma.Decimal(input.estimatedAmount),
      estimatedCurrency: input.estimatedCurrency ?? null,
      isEmergency: input.isEmergency ?? false,
      isLikeForLike: input.isLikeForLike ?? null,
      isUpgrade: input.isUpgrade ?? null,
      isMajorReplacement: input.isMajorReplacement ?? null,
      isResponsibilityDisputed: input.isResponsibilityDisputed ?? null,
      ownerApprovalDecisionSource:
        input.ownerApprovalDecisionSource ?? null,
      ownerApprovalOverrideReason: input.ownerApprovalOverrideReason ?? null,
      ownerApprovalOverriddenByUserId:
        input.ownerApprovalOverriddenByUserId ?? null,
    };
    this.requests.push(created);
    return created;
  }

  updateGrantStatus(grantId: string, status: OwnerAccessGrantStatus) {
    const grant = this.grants.find((item) => item.id === grantId);
    if (!grant) {
      throw new Error('Grant not found');
    }
    grant.status = status;
  }

  setOwnerActive(ownerId: string, isActive: boolean) {
    const owner = this.owners.find((item) => item.id === ownerId);
    if (!owner) {
      throw new Error('Owner not found');
    }
    owner.isActive = isActive;
  }

  reassignUnit(unitId: string, orgId: string, ownerId: string | null) {
    const unit = this.units.find((item) => item.id === unitId);
    if (!unit) {
      throw new Error('Unit not found');
    }
    unit.ownerId = ownerId;

    const now = new Date();
    for (const row of this.ownerships) {
      if (row.unitId === unitId && row.endDate === null) {
        row.endDate = now;
        row.updatedAt = now;
      }
    }

    if (ownerId) {
      this.ownerships.push({
        id: randomUUID(),
        orgId,
        unitId,
        ownerId,
        startDate: now,
        endDate: null,
        isPrimary: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  listOwnerApprovalAudits(requestId: string) {
    return this.ownerApprovalAudits.filter((item) => item.requestId === requestId);
  }

  private hydrateRequest(
    request: MaintenanceRequestRecord,
    include?: {
      unit?: boolean;
      createdByUser?:
        | boolean
        | { select: { id: true; name: true; email: true } };
      assignedToUser?:
        | boolean
        | { select: { id: true; name: true; email: true } };
      attachments?:
        | boolean
        | {
            select: {
              id: true;
              fileName: true;
              mimeType: true;
              sizeBytes: true;
              url: true;
              createdAt: true;
            };
          };
    },
  ) {
    const unit = request.unitId
      ? this.units.find((item) => item.id === request.unitId) ?? null
      : null;
    const createdByUser = this.users.find(
      (user) => user.id === request.createdByUserId,
    );
    const assignedToUser = request.assignedToUserId
      ? this.users.find((user) => user.id === request.assignedToUserId) ?? null
      : null;
    const attachments = this.attachments.filter(
      (attachment) => attachment.requestId === request.id,
    );

    return {
      ...request,
      ...(include?.unit
        ? {
            unit: unit
              ? {
                  id: unit.id,
                  label: unit.label,
                  floor: unit.floor,
                }
              : null,
          }
        : {}),
      ...(include?.createdByUser
        ? {
            createdByUser: createdByUser
              ? {
                  id: createdByUser.id,
                  name: createdByUser.name,
                  email: createdByUser.email,
                }
              : null,
          }
        : {}),
      ...(include?.assignedToUser
        ? {
            assignedToUser: assignedToUser
              ? {
                  id: assignedToUser.id,
                  name: assignedToUser.name,
                  email: assignedToUser.email,
                }
              : null,
          }
        : {}),
      ...(include?.attachments
        ? {
            attachments: attachments.map((attachment) => ({
              id: attachment.id,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              url: attachment.url,
              createdAt: attachment.createdAt,
            })),
          }
        : {}),
    };
  }

  private matchesGrantOwnerScope(
    grant: OwnerAccessGrantRecord,
    where: {
      userId: string;
      status: OwnerAccessGrantStatus;
      owner?: { isActive?: boolean };
    },
  ) {
    if (grant.userId !== where.userId || grant.status !== where.status) {
      return false;
    }
    if (where.owner?.isActive !== undefined) {
      const owner = this.owners.find((item) => item.id === grant.ownerId);
      if (!owner || owner.isActive !== where.owner.isActive) {
        return false;
      }
    }
    return true;
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return false;
    }
    request.user = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
    };
    return true;
  }
}

@Injectable()
class AllowAllGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('Owner request approvals (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let orgA: OrgRecord;
  let orgB: OrgRecord;
  let buildingA: BuildingRecord;
  let buildingB: BuildingRecord;
  let managerA: UserRecord;
  let staffA: UserRecord;
  let residentA: UserRecord;
  let residentB: UserRecord;
  let ownerUser: UserRecord;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [BuildingRequestsController, OwnerPortfolioController],
      providers: [
        MaintenanceRequestsRepo,
        MaintenanceRequestsService,
        OwnerPortfolioScopeService,
        OwnerPortfolioGuard,
        OrgScopeGuard,
        BuildingAccessService,
        {
          provide: EventEmitter2,
          useValue: { emit: () => undefined },
        },
        {
          provide: ProviderAccessService,
          useValue: {
            getAccessibleProviderContext: async () => ({
              providerIds: new Set<string>(),
              adminProviderIds: new Set<string>(),
              memberships: [],
            }),
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (userId: string) =>
              accessPermissionsByUser.get(userId) ?? new Set<string>(),
            getUserScopedAssignments: async (
              userId: string,
              context?: { orgId?: string; buildingId?: string },
            ) => ({
              assignments: await prisma.userAccessAssignment.findMany({
                where: {
                  userId,
                  scopeType: 'BUILDING',
                  scopeId: context?.buildingId,
                  roleTemplate: {
                    orgId: context?.orgId,
                    scopeType: 'BUILDING',
                  },
                },
                include: {
                  roleTemplate: {
                    include: {
                      rolePermissions: {
                        include: {
                          permission: true,
                        },
                      },
                    },
                  },
                },
              }),
              rolePermissionKeys: [],
              userOverrides: [],
            }),
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .overrideGuard(BuildingAccessGuard)
      .useClass(AllowAllGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.reset();
    accessPermissionsByUser.clear();

    orgA = prisma.seedOrg('Alpha Org');
    orgB = prisma.seedOrg('Beta Org');
    buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    buildingB = prisma.seedBuilding({ orgId: orgB.id, name: 'Tower B' });

    managerA = prisma.seedUser({
      email: 'manager@alpha.test',
      name: 'Manager A',
      orgId: orgA.id,
    });
    staffA = prisma.seedUser({
      email: 'staff@alpha.test',
      name: 'Staff A',
      orgId: orgA.id,
    });
    residentA = prisma.seedUser({
      email: 'resident-a@alpha.test',
      name: 'Resident A',
      orgId: orgA.id,
    });
    residentB = prisma.seedUser({
      email: 'resident-b@beta.test',
      name: 'Resident B',
      orgId: orgB.id,
    });
    ownerUser = prisma.seedUser({
      email: 'owner@test.com',
      name: 'Owner User',
      orgId: null,
    });

    accessPermissionsByUser.set(
      managerA.id,
      new Set([
        'requests.read',
        'requests.assign',
        'requests.comment',
        'requests.update_status',
        'requests.owner_approval_override',
      ]),
    );
    accessPermissionsByUser.set(
      staffA.id,
      new Set(['requests.read', 'requests.comment', 'requests.update_status']),
    );

    prisma.seedBuildingAssignment({
      buildingId: buildingA.id,
      userId: managerA.id,
      type: 'MANAGER',
    });
    prisma.seedBuildingAssignment({
      buildingId: buildingA.id,
      userId: staffA.id,
      type: 'STAFF',
    });
  });

  const postJson = (
    url: string,
    userId: string,
    body?: Record<string, unknown>,
  ) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(body ?? {}),
    });

  const getJson = (url: string, userId: string) =>
    fetch(url, {
      headers: { 'x-user-id': userId },
    });

  const seedScopedRequest = (input?: {
    sharedPartyId?: string;
    secondOrg?: boolean;
    ownerUserId?: string;
    skipGrant?: boolean;
    ownerActive?: boolean;
    grantStatus?: OwnerAccessGrantStatus;
    ownerApprovalStatus?: MaintenanceRequestOwnerApprovalStatus;
    ownerApprovalDeadlineAt?: Date | null;
    ownerApprovalRequestedAt?: Date | null;
    ownerApprovalRequestedByUserId?: string | null;
    ownerApprovalDecidedAt?: Date | null;
    ownerApprovalDecidedByOwnerUserId?: string | null;
    ownerApprovalReason?: string | null;
    approvalRequiredReason?: string | null;
    estimatedAmount?: Prisma.Decimal | null;
    estimatedCurrency?: string | null;
  }) => {
    const targetOrg = input?.secondOrg ? orgB : orgA;
    const targetBuilding = input?.secondOrg ? buildingB : buildingA;
    const targetResident = input?.secondOrg ? residentB : residentA;
    const owner = prisma.seedOwner({
      orgId: targetOrg.id,
      partyId: input?.sharedPartyId ?? null,
      isActive: input?.ownerActive ?? true,
    });
    const unit = prisma.seedUnit({
      buildingId: targetBuilding.id,
      label: input?.secondOrg ? 'B-201' : 'A-101',
      ownerId: owner.id,
    });
    prisma.seedOwnership({
      orgId: targetOrg.id,
      unitId: unit.id,
      ownerId: owner.id,
    });
    const grant = input?.skipGrant
      ? null
      : input?.ownerUserId || input?.grantStatus
        ? prisma.seedGrant({
            userId: input?.ownerUserId ?? ownerUser.id,
            ownerId: owner.id,
            status: input?.grantStatus ?? OwnerAccessGrantStatus.ACTIVE,
          })
        : prisma.seedGrant({
            userId: ownerUser.id,
            ownerId: owner.id,
            status: OwnerAccessGrantStatus.ACTIVE,
          });
    const request = prisma.seedRequest({
      orgId: targetOrg.id,
      buildingId: targetBuilding.id,
      unitId: unit.id,
      createdByUserId: targetResident.id,
      title: input?.secondOrg ? 'Beta request' : 'Alpha request',
      description: 'Approval needed',
      priority: 'HIGH',
      type: 'MAINTENANCE',
      ownerApprovalStatus:
        input?.ownerApprovalStatus ??
        MaintenanceRequestOwnerApprovalStatus.NOT_REQUIRED,
      ownerApprovalDeadlineAt: input?.ownerApprovalDeadlineAt ?? null,
      ownerApprovalRequestedAt: input?.ownerApprovalRequestedAt ?? null,
      ownerApprovalRequestedByUserId:
        input?.ownerApprovalRequestedByUserId ?? null,
    });

    return {
      owner,
      unit,
      request,
      org: targetOrg,
      building: targetBuilding,
      grant,
    };
  };

  it('management can require, request, and resend owner approval with audit trail', async () => {
    const { request } = seedScopedRequest();
    const deadlineAt = '2026-04-10T00:00:00.000Z';

    const requireResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/owner-approval/require`,
      managerA.id,
      {
        approvalRequiredReason: 'Estimate exceeds owner threshold',
        estimatedAmount: 1250,
        estimatedCurrency: 'aed',
        ownerApprovalDeadlineAt: deadlineAt,
      },
    );
    expect(requireResponse.status).toBe(201);
    const requiredBody = await requireResponse.json();
    expect(requiredBody.ownerApproval).toMatchObject({
      status: 'PENDING',
      requiredReason: 'Estimate exceeds owner threshold',
      estimatedAmount: '1250',
      estimatedCurrency: 'AED',
      deadlineAt,
      requestedAt: null,
    });

    const requestResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/owner-approval/request`,
      managerA.id,
    );
    expect(requestResponse.status).toBe(201);
    const requestBody = await requestResponse.json();
    expect(requestBody.ownerApproval).toMatchObject({
      status: 'PENDING',
      requestedByUserId: managerA.id,
    });
    expect(requestBody.ownerApproval.requestedAt).toBeTruthy();

    const resendResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/owner-approval/resend`,
      managerA.id,
    );
    expect(resendResponse.status).toBe(201);
    const resendBody = await resendResponse.json();
    expect(resendBody.ownerApproval).toMatchObject({
      status: 'PENDING',
      requestedByUserId: managerA.id,
    });

    expect(
      prisma.listOwnerApprovalAudits(request.id).map((audit) => audit.action),
    ).toEqual(['REQUIRED', 'REQUESTED', 'RESENT']);
  });

  it('management can request owner approval atomically with recommendation data', async () => {
    const { request } = seedScopedRequest();

    const response = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/owner-approval/request-now`,
      managerA.id,
      {
        approvalRequiredReason: 'Non-like-for-like replacement above threshold',
        estimatedAmount: 1400,
        estimatedCurrency: 'aed',
        isLikeForLike: false,
        isUpgrade: true,
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'PENDING',
      requiredReason: 'Non-like-for-like replacement above threshold',
      estimatedAmount: '1400',
      estimatedCurrency: 'AED',
      requestedByUserId: managerA.id,
    });
    expect(body.ownerApproval.requestedAt).toBeTruthy();
    expect(body.policy).toMatchObject({
      isEmergency: false,
      isLikeForLike: false,
      isUpgrade: true,
      route: 'OWNER_APPROVAL_REQUIRED',
      recommendation: 'REQUEST_OWNER_APPROVAL',
    });
    expect(body.queue).toBe('AWAITING_OWNER');
    expect(
      prisma.listOwnerApprovalAudits(request.id).map((audit) => audit.action),
    ).toEqual(['REQUIRED', 'REQUESTED']);
  });

  it('management can save policy triage without starting owner approval', async () => {
    const { request } = seedScopedRequest();

    const response = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/policy-triage`,
      managerA.id,
      {
        estimatedAmount: 900,
        estimatedCurrency: 'aed',
        isEmergency: true,
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'NOT_REQUIRED',
      requestedAt: null,
      estimatedAmount: '900',
      estimatedCurrency: 'AED',
    });
    expect(body.policy).toMatchObject({
      isEmergency: true,
      route: 'EMERGENCY_DISPATCH',
      recommendation: 'PROCEED_AND_NOTIFY',
    });
    expect(body.queue).toBe('READY_TO_ASSIGN');
    expect(prisma.listOwnerApprovalAudits(request.id)).toEqual([]);
  });

  it('management can submit an estimate and keep a low-cost request ready to assign', async () => {
    const { request } = seedScopedRequest();

    const response = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/estimate`,
      managerA.id,
      {
        estimatedAmount: 650,
        estimatedCurrency: 'aed',
        isLikeForLike: true,
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'NOT_REQUIRED',
      requestedAt: null,
      estimatedAmount: '650',
      estimatedCurrency: 'AED',
    });
    expect(body.policy).toMatchObject({
      route: 'DIRECT_ASSIGN',
      recommendation: 'PROCEED_NOW',
    });
    expect(body.queue).toBe('READY_TO_ASSIGN');
  });

  it('management can submit an estimate that automatically requests owner approval', async () => {
    const { request } = seedScopedRequest();

    const response = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/estimate`,
      managerA.id,
      {
        estimatedAmount: 1800,
        estimatedCurrency: 'aed',
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'PENDING',
      requiredReason: 'Estimate exceeds owner approval threshold',
      estimatedAmount: '1800',
      estimatedCurrency: 'AED',
      requestedByUserId: managerA.id,
    });
    expect(body.ownerApproval.requestedAt).toBeTruthy();
    expect(body.policy).toMatchObject({
      route: 'OWNER_APPROVAL_REQUIRED',
      recommendation: 'REQUEST_OWNER_APPROVAL',
    });
    expect(body.queue).toBe('AWAITING_OWNER');
    expect(
      prisma.listOwnerApprovalAudits(request.id).map((audit) => audit.action),
    ).toEqual(['REQUIRED', 'REQUESTED']);
  });

  it('revised estimate can clear a rejected owner approval block when approval is no longer needed', async () => {
    const { request } = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.REJECTED,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
      ownerApprovalDecidedAt: new Date('2026-04-06T00:00:00.000Z'),
      ownerApprovalDecidedByOwnerUserId: ownerUser.id,
      ownerApprovalReason: 'Need lower quote',
      approvalRequiredReason: 'Initial estimate too high',
      estimatedAmount: new Prisma.Decimal(1800),
      estimatedCurrency: 'AED',
    });

    const response = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/estimate`,
      managerA.id,
      {
        estimatedAmount: 700,
        estimatedCurrency: 'aed',
        isLikeForLike: true,
      },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'NOT_REQUIRED',
      requestedAt: null,
      decidedAt: null,
      reason: null,
      requiredReason: null,
      estimatedAmount: '700',
      estimatedCurrency: 'AED',
    });
    expect(body.policy).toMatchObject({
      route: 'DIRECT_ASSIGN',
      recommendation: 'PROCEED_NOW',
    });
    expect(body.queue).toBe('READY_TO_ASSIGN');
  });

  it('owner can approve only an in-scope pending request and writes audit trail', async () => {
    const { request } = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });

    const response = await postJson(
      `${baseUrl}/owner/portfolio/requests/${request.id}/approve`,
      ownerUser.id,
      { approvalReason: 'Proceed with repair' },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'APPROVED',
      reason: 'Proceed with repair',
      decisionSource: 'OWNER',
      decidedByOwnerUserId: ownerUser.id,
    });

    const audits = prisma.listOwnerApprovalAudits(request.id);
    expect(audits[audits.length - 1]).toMatchObject({
      action: 'APPROVED',
      actorUserId: ownerUser.id,
      decisionSource: 'OWNER',
      reason: 'Proceed with repair',
    });
  });

  it('tenant cannot approve owner requests', async () => {
    const { request } = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });

    const response = await postJson(
      `${baseUrl}/owner/portfolio/requests/${request.id}/approve`,
      residentA.id,
      { approvalReason: 'No access' },
    );

    expect(response.status).toBe(403);
  });

  it('disabled grants and inactive owners revoke owner approval ability immediately', async () => {
    const disabledScope = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });
    prisma.updateGrantStatus(
      disabledScope.grant!.id,
      OwnerAccessGrantStatus.DISABLED,
    );

    const disabledResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${disabledScope.request.id}/approve`,
      ownerUser.id,
      { approvalReason: 'Should fail' },
    );
    expect(disabledResponse.status).toBe(403);

    const inactiveScope = seedScopedRequest({
      ownerUserId: ownerUser.id,
      ownerActive: true,
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });
    prisma.setOwnerActive(inactiveScope.owner.id, false);

    const inactiveResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${inactiveScope.request.id}/approve`,
      ownerUser.id,
      { approvalReason: 'Should also fail' },
    );
    expect(inactiveResponse.status).toBe(403);
  });

  it('pending approval blocks assignment and approved approval unlocks execution', async () => {
    const { request } = seedScopedRequest();

    const requireResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/owner-approval/require`,
      managerA.id,
      {
        approvalRequiredReason: 'Owner sign-off required',
      },
    );
    expect(requireResponse.status).toBe(201);

    const blockedAssignResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/assign`,
      managerA.id,
      { staffUserId: staffA.id },
    );
    expect(blockedAssignResponse.status).toBe(409);

    const approveResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${request.id}/approve`,
      ownerUser.id,
      { approvalReason: 'Approved' },
    );
    expect(approveResponse.status).toBe(201);

    const assignResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/assign`,
      managerA.id,
      { staffUserId: staffA.id },
    );
    expect(assignResponse.status).toBe(201);
    const assignedBody = await assignResponse.json();
    expect(assignedBody.status).toBe('ASSIGNED');

    const progressResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/status`,
      staffA.id,
      { status: 'IN_PROGRESS' },
    );
    expect(progressResponse.status).toBe(201);
    const progressBody = await progressResponse.json();
    expect(progressBody.status).toBe('IN_PROGRESS');
  });

  it('owner-approval-required triage blocks execution before assignment', async () => {
    const { request } = seedScopedRequest();

    const triageResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/policy-triage`,
      managerA.id,
      {
        estimatedAmount: 1800,
        estimatedCurrency: 'aed',
      },
    );
    expect(triageResponse.status).toBe(201);

    const blockedAssignResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/assign`,
      managerA.id,
      { staffUserId: staffA.id },
    );
    expect(blockedAssignResponse.status).toBe(409);
    const blockedAssignBody = await blockedAssignResponse.json();
    expect(blockedAssignBody.message).toBe(
      'Request requires owner approval before execution',
    );
  });

  it('rejected approval keeps the request visible but blocks execution', async () => {
    const { request } = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });

    const rejectResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${request.id}/reject`,
      ownerUser.id,
      { approvalReason: 'Do not proceed without a second quote' },
    );
    expect(rejectResponse.status).toBe(201);
    const rejectBody = await rejectResponse.json();
    expect(rejectBody.ownerApproval).toMatchObject({
      status: 'REJECTED',
      reason: 'Do not proceed without a second quote',
      decisionSource: 'OWNER',
    });

    const detailResponse = await getJson(
      `${baseUrl}/owner/portfolio/requests/${request.id}`,
      ownerUser.id,
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.ownerApproval.status).toBe('REJECTED');

    const blockedAssignResponse = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/assign`,
      managerA.id,
      { staffUserId: staffA.id },
    );
    expect(blockedAssignResponse.status).toBe(409);
  });

  it('urgent timeout override works after deadline expiry and is audited', async () => {
    const { request } = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalDeadlineAt: new Date('2026-04-01T00:00:00.000Z'),
      ownerApprovalRequestedAt: new Date('2026-04-01T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });

    const response = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/owner-approval/override`,
      managerA.id,
      {
        decisionSource:
          MaintenanceRequestOwnerApprovalDecisionSourceEnum.MANAGEMENT_OVERRIDE,
        ownerApprovalOverrideReason: 'Urgent repair SLA expired',
      },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'APPROVED',
      decisionSource: 'MANAGEMENT_OVERRIDE',
      overrideReason: 'Urgent repair SLA expired',
      overriddenByUserId: managerA.id,
    });

    const audits = prisma.listOwnerApprovalAudits(request.id);
    expect(audits[audits.length - 1]).toMatchObject({
      action: 'OVERRIDDEN',
      decisionSource: 'MANAGEMENT_OVERRIDE',
      reason: 'Urgent repair SLA expired',
    });
  });

  it('emergency immediate override works without waiting for deadline', async () => {
    const { request } = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalDeadlineAt: new Date('2026-04-20T00:00:00.000Z'),
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });

    const response = await postJson(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${request.id}/owner-approval/override`,
      managerA.id,
      {
        decisionSource:
          MaintenanceRequestOwnerApprovalDecisionSourceEnum.EMERGENCY_OVERRIDE,
        ownerApprovalOverrideReason: 'Flood mitigation required immediately',
      },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ownerApproval).toMatchObject({
      status: 'APPROVED',
      decisionSource: 'EMERGENCY_OVERRIDE',
      overrideReason: 'Flood mitigation required immediately',
      overriddenByUserId: managerA.id,
    });
  });

  it('same-party cross-org requests do not leak owner action rights without a second grant', async () => {
    const sharedPartyId = randomUUID();
    const inScope = seedScopedRequest({
      sharedPartyId,
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });
    const outOfScope = seedScopedRequest({
      sharedPartyId,
      secondOrg: true,
      skipGrant: true,
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });

    const hiddenApproveResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${outOfScope.request.id}/approve`,
      ownerUser.id,
      { approvalReason: 'Should not see this' },
    );
    expect(hiddenApproveResponse.status).toBe(404);

    const visibleApproveResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${inScope.request.id}/approve`,
      ownerUser.id,
      { approvalReason: 'Visible request only' },
    );
    expect(visibleApproveResponse.status).toBe(201);
  });

  it('reassignment removes the old owner ability to decide and transfers action rights to the new owner', async () => {
    const secondOwnerUser = prisma.seedUser({
      email: 'second-owner@test.com',
      name: 'Second Owner User',
      orgId: null,
    });
    const { owner: ownerA, unit, request } = seedScopedRequest({
      ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
      ownerApprovalRequestedAt: new Date('2026-04-05T00:00:00.000Z'),
      ownerApprovalRequestedByUserId: managerA.id,
    });
    const ownerB = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    prisma.seedGrant({
      userId: secondOwnerUser.id,
      ownerId: ownerB.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });

    prisma.reassignUnit(unit.id, orgA.id, ownerB.id);

    const oldOwnerResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${request.id}/approve`,
      ownerUser.id,
      { approvalReason: 'Old owner should lose access' },
    );
    expect(oldOwnerResponse.status).toBe(404);

    const newOwnerResponse = await postJson(
      `${baseUrl}/owner/portfolio/requests/${request.id}/approve`,
      secondOwnerUser.id,
      { approvalReason: 'Current owner can act' },
    );
    expect(newOwnerResponse.status).toBe(201);
    const newOwnerBody = await newOwnerResponse.json();
    expect(newOwnerBody.ownerId).toBe(ownerB.id);
    expect(ownerA.id).not.toBe(ownerB.id);
  });
});

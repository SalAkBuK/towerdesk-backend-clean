import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { MaintenanceRequestsRepo } from '../src/modules/maintenance-requests/maintenance-requests.repo';
import { MaintenanceRequestsService } from '../src/modules/maintenance-requests/maintenance-requests.service';
import { ResidentRequestsController } from '../src/modules/maintenance-requests/resident-requests.controller';
import { BuildingRequestsController } from '../src/modules/maintenance-requests/building-requests.controller';
import { ProviderRequestsController } from '../src/modules/maintenance-requests/provider-requests.controller';
import { ProviderAccessService } from '../src/modules/service-providers/provider-access.service';

type OrgRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type MaintenanceRequestStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED';

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  refreshTokenHash?: string | null;
  name?: string | null;
  orgId?: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
  city: string;
  emirate?: string | null;
  country: string;
  timezone: string;
  floors?: number | null;
  unitsCount?: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
  floor?: number | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BuildingAssignmentRecord = {
  id: string;
  buildingId: string;
  userId: string;
  type: 'MANAGER' | 'STAFF' | 'BUILDING_ADMIN';
  createdAt: Date;
  updatedAt: Date;
};

type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
  startAt: Date;
  endAt?: Date | null;
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
  leaseStartDate: Date;
  leaseEndDate: Date;
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

type RequestRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId?: string | null;
  occupancyIdAtCreation?: string | null;
  leaseIdAtCreation?: string | null;
  createdByUserId: string;
  title: string;
  description?: string | null;
  status: MaintenanceRequestStatus;
  priority?: string | null;
  type?: string | null;
  isEmergency: boolean;
  emergencySignals: string[];
  assignedToUserId?: string | null;
  serviceProviderId?: string | null;
  serviceProviderAssignedUserId?: string | null;
  estimateStatus: string;
  estimateRequestedAt?: Date | null;
  estimateRequestedByUserId?: string | null;
  estimateDueAt?: Date | null;
  estimateReminderSentAt?: Date | null;
  estimateSubmittedAt?: Date | null;
  estimateSubmittedByUserId?: string | null;
  ownerApprovalStatus: string;
  ownerApprovalRequestedAt?: Date | null;
  ownerApprovalRequestedByUserId?: string | null;
  ownerApprovalDeadlineAt?: Date | null;
  ownerApprovalDecidedAt?: Date | null;
  ownerApprovalDecidedByOwnerUserId?: string | null;
  ownerApprovalReason?: string | null;
  approvalRequiredReason?: string | null;
  estimatedAmount?: string | null;
  estimatedCurrency?: string | null;
  ownerApprovalDecisionSource?: string | null;
  ownerApprovalOverrideReason?: string | null;
  ownerApprovalOverriddenByUserId?: string | null;
  assignedAt?: Date | null;
  completedAt?: Date | null;
  canceledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CommentRecord = {
  id: string;
  requestId: string;
  orgId: string;
  authorUserId: string;
  authorOwnerId?: string | null;
  authorType: 'OWNER' | 'TENANT' | 'STAFF' | 'SYSTEM';
  visibility: 'SHARED' | 'INTERNAL';
  message: string;
  createdAt: Date;
};

type CommentReadStateRecord = {
  id: string;
  userId: string;
  requestId: string;
  scope: 'BUILDING' | 'PROVIDER';
  lastReadAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type AttachmentRecord = {
  id: string;
  requestId: string;
  orgId: string;
  uploadedByUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
};

type ServiceProviderRecord = {
  id: string;
  orgId: string;
  name: string;
  serviceCategory?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ServiceProviderBuildingRecord = {
  serviceProviderId: string;
  buildingId: string;
  createdAt: Date;
};

type ServiceProviderUserRecord = {
  serviceProviderId: string;
  userId: string;
  role: 'ADMIN' | 'WORKER';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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

type UserAccessAssignmentRecord = {
  id: string;
  userId: string;
  scopeType: 'ORG' | 'BUILDING';
  scopeId: string | null;
  roleTemplate: {
    id: string;
    orgId: string;
    key: string;
    scopeType: 'ORG' | 'BUILDING';
    rolePermissions: Array<{ permission: { key: string } }>;
  };
  createdAt: Date;
};

let prisma: InMemoryPrismaService;
const accessPermissionsByUser = new Map<string, Set<string>>();

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private units: UnitRecord[] = [];
  private assignments: BuildingAssignmentRecord[] = [];
  private occupancies: OccupancyRecord[] = [];
  private leases: LeaseRecord[] = [];
  private residentProfiles: ResidentProfileRecord[] = [];
  private residentInvites: ResidentInviteRecord[] = [];
  private requests: RequestRecord[] = [];
  private comments: CommentRecord[] = [];
  private commentReadStates: CommentReadStateRecord[] = [];
  private attachments: AttachmentRecord[] = [];
  private serviceProviders: ServiceProviderRecord[] = [];
  private serviceProviderBuildings: ServiceProviderBuildingRecord[] = [];
  private serviceProviderUsers: ServiceProviderUserRecord[] = [];
  private ownerApprovalAudits: OwnerApprovalAuditRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const now = new Date();
      const org: OrgRecord = {
        id: randomUUID(),
        name: data.name,
        createdAt: now,
        updatedAt: now,
      };
      this.orgs.push(org);
      return org;
    },
  };

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
    create: async ({
      data,
    }: {
      data: {
        email: string;
        passwordHash: string;
        name?: string | null;
        orgId?: string | null;
        mustChangePassword?: boolean;
        isActive?: boolean;
      };
    }) => {
      const now = new Date();
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name ?? null,
        orgId: data.orgId ?? null,
        mustChangePassword: data.mustChangePassword ?? false,
        isActive: data.isActive ?? true,
        refreshTokenHash: null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(user);
      return user;
    },
  };

  serviceProvider = {
    findFirst: async ({ where }: { where: { id: string; orgId: string } }) => {
      return (
        this.serviceProviders.find(
          (provider) =>
            provider.id === where.id && provider.orgId === where.orgId,
        ) ?? null
      );
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return (
        this.serviceProviders.find((provider) => provider.id === where.id) ??
        null
      );
    },
  };

  serviceProviderBuilding = {
    findUnique: async ({
      where,
    }: {
      where: {
        serviceProviderId_buildingId: {
          serviceProviderId: string;
          buildingId: string;
        };
      };
    }) => {
      return (
        this.serviceProviderBuildings.find(
          (link) =>
            link.serviceProviderId ===
              where.serviceProviderId_buildingId.serviceProviderId &&
            link.buildingId === where.serviceProviderId_buildingId.buildingId,
        ) ?? null
      );
    },
  };

  serviceProviderUser = {
    findUnique: async ({
      where,
      include,
    }: {
      where: {
        serviceProviderId_userId: {
          serviceProviderId: string;
          userId: string;
        };
      };
      include?: { user?: boolean };
    }) => {
      const membership =
        this.serviceProviderUsers.find(
          (candidate) =>
            candidate.serviceProviderId ===
              where.serviceProviderId_userId.serviceProviderId &&
            candidate.userId === where.serviceProviderId_userId.userId,
        ) ?? null;

      if (!membership) {
        return null;
      }

      return {
        ...membership,
        user: include?.user
          ? (this.users.find((user) => user.id === membership.userId) ?? null)
          : undefined,
      };
    },
    findMany: async ({
      where,
      include,
    }: {
      where: {
        userId?: string;
        isActive?: boolean;
        user?: {
          orgId?: string;
          isActive?: boolean;
        };
        serviceProvider?: {
          orgId?: string;
          isActive?: boolean;
        };
      };
      include?: { serviceProvider?: boolean };
    }) => {
      const memberships = this.serviceProviderUsers.filter((membership) => {
        if (where.userId && membership.userId !== where.userId) {
          return false;
        }
        if (
          where.isActive !== undefined &&
          membership.isActive !== where.isActive
        ) {
          return false;
        }

        const user = this.users.find(
          (candidate) => candidate.id === membership.userId,
        );
        if (!user) {
          return false;
        }
        if (where.user?.orgId && user.orgId !== where.user.orgId) {
          return false;
        }
        if (
          where.user?.isActive !== undefined &&
          user.isActive !== where.user.isActive
        ) {
          return false;
        }

        const serviceProvider = this.serviceProviders.find(
          (candidate) => candidate.id === membership.serviceProviderId,
        );
        if (!serviceProvider) {
          return false;
        }
        if (
          where.serviceProvider?.orgId &&
          serviceProvider.orgId !== where.serviceProvider.orgId
        ) {
          return false;
        }
        if (
          where.serviceProvider?.isActive !== undefined &&
          serviceProvider.isActive !== where.serviceProvider.isActive
        ) {
          return false;
        }

        return true;
      });

      return memberships.map((membership) => ({
        ...membership,
        serviceProvider: include?.serviceProvider
          ? (this.serviceProviders.find(
              (provider) => provider.id === membership.serviceProviderId,
            ) ?? null)
          : undefined,
      }));
    },
  };

  building = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        name: string;
        city: string;
        emirate?: string | null;
        country: string;
        timezone: string;
        floors?: number | null;
        unitsCount?: number | null;
      };
    }) => {
      const now = new Date();
      const building: BuildingRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        name: data.name,
        city: data.city,
        emirate: data.emirate ?? null,
        country: data.country,
        timezone: data.timezone,
        floors: data.floors ?? null,
        unitsCount: data.unitsCount ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.buildings.push(building);
      return building;
    },
    findFirst: async ({ where }: { where: { id: string; orgId: string } }) => {
      return (
        this.buildings.find(
          (building) =>
            building.id === where.id && building.orgId === where.orgId,
        ) ?? null
      );
    },
  };

  unit = {
    create: async ({
      data,
    }: {
      data: { buildingId: string; label: string };
    }) => {
      const now = new Date();
      const unit: UnitRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        label: data.label,
        floor: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };
      this.units.push(unit);
      return unit;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; buildingId: string };
    }) => {
      return (
        this.units.find(
          (unit) =>
            unit.buildingId === where.buildingId &&
            (where.id ? unit.id === where.id : true),
        ) ?? null
      );
    },
  };

  buildingAssignment = {
    findMany: async ({
      where,
    }: {
      where: { buildingId: string; userId: string };
    }) => {
      return this.assignments.filter(
        (assignment) =>
          assignment.buildingId === where.buildingId &&
          assignment.userId === where.userId,
      );
    },
    findFirst: async ({
      where,
    }: {
      where: { buildingId: string; userId: string; type: 'STAFF' };
    }) => {
      return (
        this.assignments.find(
          (assignment) =>
            assignment.buildingId === where.buildingId &&
            assignment.userId === where.userId &&
            assignment.type === where.type,
        ) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: {
        buildingId: string;
        userId: string;
        type: 'MANAGER' | 'STAFF' | 'BUILDING_ADMIN';
      };
    }) => {
      const now = new Date();
      const assignment: BuildingAssignmentRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        userId: data.userId,
        type: data.type,
        createdAt: now,
        updatedAt: now,
      };
      this.assignments.push(assignment);
      return assignment;
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
      const records: UserAccessAssignmentRecord[] = this.assignments
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
              ? ['requests.read', 'requests.update_status', 'requests.comment']
              : [
                  'requests.read',
                  'requests.assign',
                  'requests.update_status',
                  'requests.comment',
                ];
          const rolePermissions = rolePermissionKeys.map((key) => ({
            permission: { key },
          }));

          return {
            id: randomUUID(),
            userId: assignment.userId,
            scopeType: 'BUILDING',
            scopeId: assignment.buildingId,
            roleTemplate: {
              id: randomUUID(),
              orgId: building.orgId,
              key: roleTemplateKey,
              scopeType: 'BUILDING',
              rolePermissions,
            },
            createdAt: assignment.createdAt,
          };
        });

      return records.map((record) => ({
        ...record,
        roleTemplate: include?.roleTemplate ? record.roleTemplate : undefined,
        user: include?.user
          ? (this.users.find((user) => user.id === record.userId) ?? null)
          : undefined,
      }));
    },
  };

  occupancy = {
    findFirst: async ({
      where,
      include,
      orderBy,
    }: {
      where: {
        residentUserId?: string;
        unitId?: string;
        buildingId?: string;
        status: 'ACTIVE' | 'ENDED';
      };
      include?: {
        building?: boolean;
        unit?: boolean;
        lease?: { select?: { id?: boolean; status?: boolean } };
      };
      orderBy?: Array<{
        startAt?: 'asc' | 'desc';
        createdAt?: 'asc' | 'desc';
        id?: 'asc' | 'desc';
      }>;
    }) => {
      let occupancies = this.occupancies.filter(
        (occ) =>
          (where.residentUserId
            ? occ.residentUserId === where.residentUserId
            : true) &&
          (where.unitId ? occ.unitId === where.unitId : true) &&
          (where.buildingId ? occ.buildingId === where.buildingId : true) &&
          occ.status === where.status,
      );

      if (orderBy?.length) {
        occupancies = occupancies.slice().sort((a, b) => {
          for (const ordering of orderBy) {
            if (ordering.startAt) {
              if (a.startAt.getTime() !== b.startAt.getTime()) {
                return ordering.startAt === 'asc'
                  ? a.startAt.getTime() - b.startAt.getTime()
                  : b.startAt.getTime() - a.startAt.getTime();
              }
            }
            if (ordering.createdAt) {
              if (a.createdAt.getTime() !== b.createdAt.getTime()) {
                return ordering.createdAt === 'asc'
                  ? a.createdAt.getTime() - b.createdAt.getTime()
                  : b.createdAt.getTime() - a.createdAt.getTime();
              }
            }
            if (ordering.id && a.id !== b.id) {
              return ordering.id === 'asc'
                ? a.id.localeCompare(b.id)
                : b.id.localeCompare(a.id);
            }
          }
          return 0;
        });
      }

      const occupancy = occupancies[0] ?? null;
      if (!occupancy) {
        return null;
      }
      return {
        ...occupancy,
        building: include?.building
          ? this.buildings.find((b) => b.id === occupancy.buildingId)
          : undefined,
        unit: include?.unit
          ? this.units.find((u) => u.id === occupancy.unitId)
          : undefined,
        lease: include?.lease
          ? (() => {
              const lease = this.leases.find(
                (candidate) => candidate.occupancyId === occupancy.id,
              );
              return lease
                ? {
                    ...(include.lease?.select?.id ? { id: lease.id } : {}),
                    ...(include.lease?.select?.status
                      ? { status: lease.status }
                      : {}),
                  }
                : null;
            })()
          : undefined,
      };
    },
    findMany: async ({
      where,
      select,
      orderBy,
    }: {
      where: {
        residentUserId?: { in: string[] };
        unitId?: { in: string[] };
        status?: 'ACTIVE' | 'ENDED';
        building?: { orgId?: { in: string[] } };
      };
      select: {
        id?: boolean;
        residentUserId?: boolean;
        buildingId?: boolean;
        status?: boolean;
        unitId?: boolean;
        startAt?: boolean;
        endAt?: boolean;
        createdAt?: boolean;
        building?: { select: { orgId?: boolean } };
        residentUser?: { select: { name?: boolean } };
      };
      orderBy?: Array<{
        startAt?: 'asc' | 'desc';
        createdAt?: 'asc' | 'desc';
        id?: 'asc' | 'desc';
      }>;
    }) => {
      let rows = this.occupancies.filter((occupancy) => {
        if (
          where.residentUserId?.in &&
          !where.residentUserId.in.includes(occupancy.residentUserId)
        ) {
          return false;
        }
        if (where.unitId?.in && !where.unitId.in.includes(occupancy.unitId)) {
          return false;
        }
        if (where.status && occupancy.status !== where.status) {
          return false;
        }
        if (where.building?.orgId?.in) {
          const building = this.buildings.find(
            (candidate) => candidate.id === occupancy.buildingId,
          );
          if (!building || !where.building.orgId.in.includes(building.orgId)) {
            return false;
          }
        }
        return true;
      });

      if (orderBy?.length) {
        rows = rows.slice().sort((a, b) => {
          for (const ordering of orderBy) {
            if (ordering.startAt) {
              if (a.startAt.getTime() !== b.startAt.getTime()) {
                return ordering.startAt === 'asc'
                  ? a.startAt.getTime() - b.startAt.getTime()
                  : b.startAt.getTime() - a.startAt.getTime();
              }
            }
            if (ordering.createdAt) {
              if (a.createdAt.getTime() !== b.createdAt.getTime()) {
                return ordering.createdAt === 'asc'
                  ? a.createdAt.getTime() - b.createdAt.getTime()
                  : b.createdAt.getTime() - a.createdAt.getTime();
              }
            }
            if (ordering.id && a.id !== b.id) {
              return ordering.id === 'asc'
                ? a.id.localeCompare(b.id)
                : b.id.localeCompare(a.id);
            }
          }
          return 0;
        });
      }

      return rows.map((occupancy) => {
        const residentUser = this.users.find(
          (user) => user.id === occupancy.residentUserId,
        );
        const building = this.buildings.find(
          (candidate) => candidate.id === occupancy.buildingId,
        );

        return {
          ...(select.id ? { id: occupancy.id } : {}),
          ...(select.residentUserId
            ? { residentUserId: occupancy.residentUserId }
            : {}),
          ...(select.buildingId ? { buildingId: occupancy.buildingId } : {}),
          ...(select.status ? { status: occupancy.status } : {}),
          ...(select.unitId ? { unitId: occupancy.unitId } : {}),
          ...(select.startAt ? { startAt: occupancy.startAt } : {}),
          ...(select.endAt ? { endAt: occupancy.endAt } : {}),
          ...(select.createdAt ? { createdAt: occupancy.createdAt } : {}),
          ...(select.building
            ? {
                building: {
                  ...(select.building.select.orgId
                    ? { orgId: building?.orgId }
                    : {}),
                },
              }
            : {}),
          ...(select.residentUser
            ? {
                residentUser: {
                  ...(select.residentUser.select.name
                    ? { name: residentUser?.name ?? null }
                    : {}),
                },
              }
            : {}),
        };
      });
    },
    create: async ({
      data,
    }: {
      data: {
        buildingId: string;
        unitId: string;
        residentUserId: string;
        status: 'ACTIVE' | 'ENDED';
      };
    }) => {
      const now = new Date();
      const occupancy: OccupancyRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        unitId: data.unitId,
        residentUserId: data.residentUserId,
        status: data.status,
        startAt: now,
        endAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.occupancies.push(occupancy);
      return occupancy;
    },
  };

  lease = {
    findMany: async ({
      where,
      select,
      orderBy,
    }: {
      where: {
        residentUserId?: { in: string[] };
        orgId?: { in: string[] };
        status?: 'ACTIVE';
      };
      select: {
        id?: boolean;
        orgId?: boolean;
        buildingId?: boolean;
        unitId?: boolean;
        occupancyId?: boolean;
        residentUserId?: boolean;
        status?: boolean;
        leaseStartDate?: boolean;
        leaseEndDate?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      };
      orderBy?: Array<{
        leaseStartDate?: 'asc' | 'desc';
        updatedAt?: 'asc' | 'desc';
        id?: 'asc' | 'desc';
      }>;
    }) => {
      let rows = this.leases.filter((lease) => {
        if (
          where.residentUserId?.in &&
          !where.residentUserId.in.includes(lease.residentUserId ?? '')
        ) {
          return false;
        }
        if (where.orgId?.in && !where.orgId.in.includes(lease.orgId)) {
          return false;
        }
        if (where.status && lease.status !== where.status) {
          return false;
        }
        return true;
      });

      if (orderBy?.length) {
        rows = rows.slice().sort((a, b) => {
          for (const ordering of orderBy) {
            if (ordering.leaseStartDate) {
              if (a.leaseStartDate.getTime() !== b.leaseStartDate.getTime()) {
                return ordering.leaseStartDate === 'asc'
                  ? a.leaseStartDate.getTime() - b.leaseStartDate.getTime()
                  : b.leaseStartDate.getTime() - a.leaseStartDate.getTime();
              }
            }
            if (ordering.updatedAt) {
              if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
                return ordering.updatedAt === 'asc'
                  ? a.updatedAt.getTime() - b.updatedAt.getTime()
                  : b.updatedAt.getTime() - a.updatedAt.getTime();
              }
            }
            if (ordering.id && a.id !== b.id) {
              return ordering.id === 'asc'
                ? a.id.localeCompare(b.id)
                : b.id.localeCompare(a.id);
            }
          }
          return 0;
        });
      }

      return rows.map((lease) => ({
        ...(select.id ? { id: lease.id } : {}),
        ...(select.orgId ? { orgId: lease.orgId } : {}),
        ...(select.buildingId ? { buildingId: lease.buildingId } : {}),
        ...(select.unitId ? { unitId: lease.unitId } : {}),
        ...(select.occupancyId ? { occupancyId: lease.occupancyId } : {}),
        ...(select.residentUserId
          ? { residentUserId: lease.residentUserId }
          : {}),
        ...(select.status ? { status: lease.status } : {}),
        ...(select.leaseStartDate
          ? { leaseStartDate: lease.leaseStartDate }
          : {}),
        ...(select.leaseEndDate ? { leaseEndDate: lease.leaseEndDate } : {}),
        ...(select.createdAt ? { createdAt: lease.createdAt } : {}),
        ...(select.updatedAt ? { updatedAt: lease.updatedAt } : {}),
      }));
    },
  };

  residentProfile = {
    findMany: async ({
      where,
      select,
    }: {
      where: { orgId: { in: string[] }; userId: { in: string[] } };
      select: { orgId?: boolean; userId?: boolean };
    }) => {
      return this.residentProfiles
        .filter(
          (profile) =>
            where.orgId.in.includes(profile.orgId) &&
            where.userId.in.includes(profile.userId),
        )
        .map((profile) => ({
          ...(select.orgId ? { orgId: profile.orgId } : {}),
          ...(select.userId ? { userId: profile.userId } : {}),
        }));
    },
  };

  residentInvite = {
    findMany: async ({
      where,
      select,
      orderBy,
    }: {
      where: { orgId: { in: string[] }; userId: { in: string[] } };
      select: {
        orgId?: boolean;
        userId?: boolean;
        status?: boolean;
        expiresAt?: boolean;
        sentAt?: boolean;
        id?: boolean;
      };
      orderBy?: Array<{ sentAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      let rows = this.residentInvites.filter(
        (invite) =>
          where.orgId.in.includes(invite.orgId) &&
          where.userId.in.includes(invite.userId),
      );

      if (orderBy?.length) {
        rows = rows.slice().sort((a, b) => {
          for (const ordering of orderBy) {
            if (ordering.sentAt) {
              if (a.sentAt.getTime() !== b.sentAt.getTime()) {
                return ordering.sentAt === 'asc'
                  ? a.sentAt.getTime() - b.sentAt.getTime()
                  : b.sentAt.getTime() - a.sentAt.getTime();
              }
            }
            if (ordering.id && a.id !== b.id) {
              return ordering.id === 'asc'
                ? a.id.localeCompare(b.id)
                : b.id.localeCompare(a.id);
            }
          }
          return 0;
        });
      }

      return rows.map((invite) => ({
        ...(select.orgId ? { orgId: invite.orgId } : {}),
        ...(select.userId ? { userId: invite.userId } : {}),
        ...(select.status ? { status: invite.status } : {}),
        ...(select.expiresAt ? { expiresAt: invite.expiresAt } : {}),
        ...(select.sentAt ? { sentAt: invite.sentAt } : {}),
        ...(select.id ? { id: invite.id } : {}),
      }));
    },
  };

  maintenanceRequest = {
    create: async ({
      data,
      include,
    }: {
      data: {
        org: { connect: { id: string } };
        building: { connect: { id: string } };
        unit?: { connect: { id: string } } | null;
        occupancyAtCreation?: { connect: { id: string } };
        leaseAtCreation?: { connect: { id: string } };
        createdByUser: { connect: { id: string } };
        title: string;
        description?: string | null;
        status: MaintenanceRequestStatus;
        priority?: string | null;
        type?: string | null;
        isEmergency?: boolean;
        emergencySignals?: string[];
      };
      include?: {
        building?: boolean;
        unit?: boolean;
        assignedToUser?: boolean;
        attachments?: boolean;
        createdByUser?: boolean;
        serviceProvider?: boolean;
        serviceProviderAssignedUser?: boolean;
      };
    }) => {
      const now = new Date();
      const request: RequestRecord = {
        id: randomUUID(),
        orgId: data.org.connect.id,
        buildingId: data.building.connect.id,
        unitId: data.unit?.connect.id ?? null,
        occupancyIdAtCreation: data.occupancyAtCreation?.connect.id ?? null,
        leaseIdAtCreation: data.leaseAtCreation?.connect.id ?? null,
        createdByUserId: data.createdByUser.connect.id,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        priority: data.priority ?? null,
        type: data.type ?? null,
        isEmergency: data.isEmergency ?? false,
        emergencySignals: data.emergencySignals ?? [],
        assignedToUserId: null,
        serviceProviderId: null,
        serviceProviderAssignedUserId: null,
        estimateStatus: 'NOT_REQUESTED',
        estimateRequestedAt: null,
        estimateRequestedByUserId: null,
        estimateDueAt: null,
        estimateReminderSentAt: null,
        estimateSubmittedAt: null,
        estimateSubmittedByUserId: null,
        ownerApprovalStatus: 'NOT_REQUIRED',
        ownerApprovalRequestedAt: null,
        ownerApprovalRequestedByUserId: null,
        ownerApprovalDeadlineAt: null,
        ownerApprovalDecidedAt: null,
        ownerApprovalDecidedByOwnerUserId: null,
        ownerApprovalReason: null,
        approvalRequiredReason: null,
        estimatedAmount: null,
        estimatedCurrency: null,
        ownerApprovalDecisionSource: null,
        ownerApprovalOverrideReason: null,
        ownerApprovalOverriddenByUserId: null,
        assignedAt: null,
        completedAt: null,
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.requests.push(request);
      return this.hydrateRequest(request, include);
    },
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
        serviceProviderId?: string | { in: string[] };
        status?: MaintenanceRequestStatus;
      };
      include?: {
        building?: boolean;
        unit?: boolean;
        createdByUser?: boolean;
        assignedToUser?: boolean;
        serviceProvider?: boolean;
        serviceProviderAssignedUser?: boolean;
        attachments?: boolean;
      };
      orderBy?: { createdAt: 'desc' };
    }) => {
      let results = this.requests.filter((req) =>
        where.orgId ? req.orgId === where.orgId : true,
      );
      const serviceProviderFilter = where.serviceProviderId;
      if (where.buildingId) {
        results = results.filter((req) => req.buildingId === where.buildingId);
      }
      if (where.createdByUserId) {
        results = results.filter(
          (req) => req.createdByUserId === where.createdByUserId,
        );
      }
      if (where.assignedToUserId) {
        results = results.filter(
          (req) => req.assignedToUserId === where.assignedToUserId,
        );
      }
      if (serviceProviderFilter) {
        results = results.filter((req) =>
          typeof serviceProviderFilter === 'string'
            ? req.serviceProviderId === serviceProviderFilter
            : serviceProviderFilter.in.includes(req.serviceProviderId ?? ''),
        );
      }
      if (where.status) {
        results = results.filter((req) => req.status === where.status);
      }
      if (orderBy?.createdAt === 'desc') {
        results = [...results].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }
      return results.map((req) => this.hydrateRequest(req, include));
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
        serviceProviderId?: { in: string[] };
      };
      include?: {
        building?: boolean;
        unit?: boolean;
        createdByUser?: boolean;
        assignedToUser?: boolean;
        serviceProvider?: boolean;
        serviceProviderAssignedUser?: boolean;
        attachments?: boolean;
      };
    }) => {
      const serviceProviderIds = where.serviceProviderId?.in;
      const request =
        this.requests.find(
          (req) =>
            req.id === where.id &&
            (where.orgId ? req.orgId === where.orgId : true) &&
            (where.buildingId ? req.buildingId === where.buildingId : true) &&
            (serviceProviderIds
              ? serviceProviderIds.includes(req.serviceProviderId ?? '')
              : true) &&
            (where.createdByUserId
              ? req.createdByUserId === where.createdByUserId
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
      data: {
        title?: string;
        description?: string | null;
        status?: MaintenanceRequestStatus;
        assignedAt?: Date | null;
        completedAt?: Date | null;
        canceledAt?: Date | null;
        assignedToUser?: { connect?: { id: string } } | { disconnect?: true };
        serviceProvider?: { connect?: { id: string } } | { disconnect?: true };
        serviceProviderAssignedUser?:
          | { connect?: { id: string } }
          | { disconnect?: true };
        estimateStatus?: string;
        estimateRequestedAt?: Date | null;
        estimateRequestedByUser?:
          | { connect?: { id: string } }
          | { disconnect?: true };
        estimateDueAt?: Date | null;
        estimateReminderSentAt?: Date | null;
        estimateSubmittedAt?: Date | null;
        estimateSubmittedByUser?:
          | { connect?: { id: string } }
          | { disconnect?: true };
        ownerApprovalStatus?: string;
        ownerApprovalRequestedAt?: Date | null;
        ownerApprovalRequestedByUser?:
          | { connect?: { id: string } }
          | { disconnect?: true };
        ownerApprovalDeadlineAt?: Date | null;
        ownerApprovalDecidedAt?: Date | null;
        ownerApprovalDecidedByOwnerUser?:
          | { connect?: { id: string } }
          | { disconnect?: true };
        ownerApprovalReason?: string | null;
        approvalRequiredReason?: string | null;
        estimatedAmount?: { toString(): string } | string | number | null;
        estimatedCurrency?: string | null;
        ownerApprovalDecisionSource?: string | null;
        ownerApprovalOverrideReason?: string | null;
        ownerApprovalOverriddenByUser?:
          | { connect?: { id: string } }
          | { disconnect?: true };
      };
      include?: {
        building?: boolean;
        unit?: boolean;
        createdByUser?: boolean;
        assignedToUser?: boolean;
        serviceProvider?: boolean;
        serviceProviderAssignedUser?: boolean;
      };
    }) => {
      const request = this.requests.find((req) => req.id === where.id);
      if (!request) {
        throw new Error('Request not found');
      }
      if (data.title !== undefined) {
        request.title = data.title;
      }
      if (data.description !== undefined) {
        request.description = data.description;
      }
      if (data.status) {
        request.status = data.status;
      }
      if (data.assignedToUser) {
        if ('connect' in data.assignedToUser && data.assignedToUser.connect) {
          request.assignedToUserId = data.assignedToUser.connect.id;
        }
        if (
          'disconnect' in data.assignedToUser &&
          data.assignedToUser.disconnect
        ) {
          request.assignedToUserId = null;
        }
      }
      if (data.serviceProvider) {
        if ('connect' in data.serviceProvider && data.serviceProvider.connect) {
          request.serviceProviderId = data.serviceProvider.connect.id;
        }
        if (
          'disconnect' in data.serviceProvider &&
          data.serviceProvider.disconnect
        ) {
          request.serviceProviderId = null;
        }
      }
      if (data.serviceProviderAssignedUser) {
        if (
          'connect' in data.serviceProviderAssignedUser &&
          data.serviceProviderAssignedUser.connect
        ) {
          request.serviceProviderAssignedUserId =
            data.serviceProviderAssignedUser.connect.id;
        }
        if (
          'disconnect' in data.serviceProviderAssignedUser &&
          data.serviceProviderAssignedUser.disconnect
        ) {
          request.serviceProviderAssignedUserId = null;
        }
      }
      if (data.estimateStatus !== undefined) {
        request.estimateStatus = data.estimateStatus;
      }
      if (data.estimateRequestedAt !== undefined) {
        request.estimateRequestedAt = data.estimateRequestedAt;
      }
      if (data.estimateRequestedByUser) {
        if (
          'connect' in data.estimateRequestedByUser &&
          data.estimateRequestedByUser.connect
        ) {
          request.estimateRequestedByUserId =
            data.estimateRequestedByUser.connect.id;
        }
        if (
          'disconnect' in data.estimateRequestedByUser &&
          data.estimateRequestedByUser.disconnect
        ) {
          request.estimateRequestedByUserId = null;
        }
      }
      if (data.estimateDueAt !== undefined) {
        request.estimateDueAt = data.estimateDueAt;
      }
      if (data.estimateReminderSentAt !== undefined) {
        request.estimateReminderSentAt = data.estimateReminderSentAt;
      }
      if (data.estimateSubmittedAt !== undefined) {
        request.estimateSubmittedAt = data.estimateSubmittedAt;
      }
      if (data.estimateSubmittedByUser) {
        if (
          'connect' in data.estimateSubmittedByUser &&
          data.estimateSubmittedByUser.connect
        ) {
          request.estimateSubmittedByUserId =
            data.estimateSubmittedByUser.connect.id;
        }
        if (
          'disconnect' in data.estimateSubmittedByUser &&
          data.estimateSubmittedByUser.disconnect
        ) {
          request.estimateSubmittedByUserId = null;
        }
      }
      if (data.ownerApprovalStatus !== undefined) {
        request.ownerApprovalStatus = data.ownerApprovalStatus;
      }
      if (data.ownerApprovalRequestedAt !== undefined) {
        request.ownerApprovalRequestedAt = data.ownerApprovalRequestedAt;
      }
      if (data.ownerApprovalRequestedByUser) {
        if (
          'connect' in data.ownerApprovalRequestedByUser &&
          data.ownerApprovalRequestedByUser.connect
        ) {
          request.ownerApprovalRequestedByUserId =
            data.ownerApprovalRequestedByUser.connect.id;
        }
        if (
          'disconnect' in data.ownerApprovalRequestedByUser &&
          data.ownerApprovalRequestedByUser.disconnect
        ) {
          request.ownerApprovalRequestedByUserId = null;
        }
      }
      if (data.ownerApprovalDeadlineAt !== undefined) {
        request.ownerApprovalDeadlineAt = data.ownerApprovalDeadlineAt;
      }
      if (data.ownerApprovalDecidedAt !== undefined) {
        request.ownerApprovalDecidedAt = data.ownerApprovalDecidedAt;
      }
      if (data.ownerApprovalDecidedByOwnerUser) {
        if (
          'connect' in data.ownerApprovalDecidedByOwnerUser &&
          data.ownerApprovalDecidedByOwnerUser.connect
        ) {
          request.ownerApprovalDecidedByOwnerUserId =
            data.ownerApprovalDecidedByOwnerUser.connect.id;
        }
        if (
          'disconnect' in data.ownerApprovalDecidedByOwnerUser &&
          data.ownerApprovalDecidedByOwnerUser.disconnect
        ) {
          request.ownerApprovalDecidedByOwnerUserId = null;
        }
      }
      if (data.ownerApprovalReason !== undefined) {
        request.ownerApprovalReason = data.ownerApprovalReason;
      }
      if (data.approvalRequiredReason !== undefined) {
        request.approvalRequiredReason = data.approvalRequiredReason;
      }
      if (data.estimatedAmount !== undefined) {
        request.estimatedAmount =
          data.estimatedAmount === null
            ? null
            : data.estimatedAmount.toString();
      }
      if (data.estimatedCurrency !== undefined) {
        request.estimatedCurrency = data.estimatedCurrency;
      }
      if (data.ownerApprovalDecisionSource !== undefined) {
        request.ownerApprovalDecisionSource = data.ownerApprovalDecisionSource;
      }
      if (data.ownerApprovalOverrideReason !== undefined) {
        request.ownerApprovalOverrideReason = data.ownerApprovalOverrideReason;
      }
      if (data.ownerApprovalOverriddenByUser) {
        if (
          'connect' in data.ownerApprovalOverriddenByUser &&
          data.ownerApprovalOverriddenByUser.connect
        ) {
          request.ownerApprovalOverriddenByUserId =
            data.ownerApprovalOverriddenByUser.connect.id;
        }
        if (
          'disconnect' in data.ownerApprovalOverriddenByUser &&
          data.ownerApprovalOverriddenByUser.disconnect
        ) {
          request.ownerApprovalOverriddenByUserId = null;
        }
      }
      if (data.assignedAt !== undefined) {
        request.assignedAt = data.assignedAt;
      }
      if (data.completedAt !== undefined) {
        request.completedAt = data.completedAt;
      }
      if (data.canceledAt !== undefined) {
        request.canceledAt = data.canceledAt;
      }
      request.updatedAt = new Date();
      return this.hydrateRequest(request, include);
    },
  };

  maintenanceRequestComment = {
    create: async ({
      data,
      include,
    }: {
      data: {
        request: { connect: { id: string } };
        org: { connect: { id: string } };
        authorUser: { connect: { id: string } };
        authorOwner?: { connect: { id: string } };
        authorType: 'OWNER' | 'TENANT' | 'STAFF' | 'SYSTEM';
        visibility: 'SHARED' | 'INTERNAL';
        message: string;
      };
      include?: { authorUser?: boolean; authorOwner?: boolean };
    }) => {
      const now = new Date();
      const comment: CommentRecord = {
        id: randomUUID(),
        requestId: data.request.connect.id,
        orgId: data.org.connect.id,
        authorUserId: data.authorUser.connect.id,
        authorOwnerId: data.authorOwner?.connect.id ?? null,
        authorType: data.authorType,
        visibility: data.visibility,
        message: data.message,
        createdAt: now,
      };
      this.comments.push(comment);
      return this.hydrateComment(comment, include);
    },
    findMany: async ({
      where,
      select,
      include,
      orderBy,
    }: {
      where: {
        orgId?: string;
        requestId: string | { in: string[] };
        visibility?: 'SHARED' | 'INTERNAL';
        authorUserId?: { not: string };
      };
      select?: { requestId?: boolean; createdAt?: boolean };
      include?: { authorUser?: boolean; authorOwner?: boolean };
      orderBy?: { createdAt: 'asc' };
    }) => {
      let results = this.comments.filter(
        (comment) =>
          (where.orgId ? comment.orgId === where.orgId : true) &&
          (typeof where.requestId === 'string'
            ? comment.requestId === where.requestId
            : where.requestId.in.includes(comment.requestId)) &&
          (where.visibility ? comment.visibility === where.visibility : true) &&
          (where.authorUserId?.not
            ? comment.authorUserId !== where.authorUserId.not
            : true),
      );
      if (orderBy?.createdAt === 'asc') {
        results = [...results].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      return results.map((comment) => {
        if (select) {
          return {
            ...(select.requestId ? { requestId: comment.requestId } : {}),
            ...(select.createdAt ? { createdAt: comment.createdAt } : {}),
          };
        }
        return this.hydrateComment(comment, include);
      });
    },
  };

  maintenanceRequestCommentReadState = {
    findMany: async ({
      where,
      select,
    }: {
      where: {
        userId: string;
        requestId: { in: string[] };
        scope: 'BUILDING' | 'PROVIDER';
      };
      select?: { requestId?: boolean; lastReadAt?: boolean };
    }) => {
      return this.commentReadStates
        .filter(
          (state) =>
            state.userId === where.userId &&
            state.scope === where.scope &&
            where.requestId.in.includes(state.requestId),
        )
        .map((state) => ({
          ...(select?.requestId ? { requestId: state.requestId } : {}),
          ...(select?.lastReadAt ? { lastReadAt: state.lastReadAt } : {}),
        }));
    },
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: {
        userId_requestId_scope: {
          userId: string;
          requestId: string;
          scope: 'BUILDING' | 'PROVIDER';
        };
      };
      update: { lastReadAt: Date };
      create: {
        userId: string;
        requestId: string;
        scope: 'BUILDING' | 'PROVIDER';
        lastReadAt: Date;
      };
    }) => {
      const existing = this.commentReadStates.find(
        (state) =>
          state.userId === where.userId_requestId_scope.userId &&
          state.requestId === where.userId_requestId_scope.requestId &&
          state.scope === where.userId_requestId_scope.scope,
      );
      if (existing) {
        existing.lastReadAt = update.lastReadAt;
        existing.updatedAt = new Date();
        return { ...existing };
      }

      const now = new Date();
      const createdState: CommentReadStateRecord = {
        id: randomUUID(),
        userId: create.userId,
        requestId: create.requestId,
        scope: create.scope,
        lastReadAt: create.lastReadAt,
        createdAt: now,
        updatedAt: now,
      };
      this.commentReadStates.push(createdState);
      return { ...createdState };
    },
  };

  maintenanceRequestAttachment = {
    createMany: async ({
      data,
    }: {
      data: {
        requestId: string;
        orgId: string;
        uploadedByUserId: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        url: string;
      }[];
    }) => {
      const now = new Date();
      for (const attachment of data) {
        const record: AttachmentRecord = {
          id: randomUUID(),
          requestId: attachment.requestId,
          orgId: attachment.orgId,
          uploadedByUserId: attachment.uploadedByUserId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          url: attachment.url,
          createdAt: now,
        };
        this.attachments.push(record);
      }
      return { count: data.length };
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
      const audit: OwnerApprovalAuditRecord = {
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
      this.ownerApprovalAudits.push(audit);
      return audit;
    },
  };

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]) {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg(this);
  }

  getRequest(requestId: string) {
    return this.requests.find((request) => request.id === requestId) ?? null;
  }

  private hydrateRequest(
    request: RequestRecord,
    include?: {
      building?: boolean;
      unit?: boolean;
      createdByUser?: boolean;
      assignedToUser?: boolean;
      serviceProvider?: boolean;
      serviceProviderAssignedUser?: boolean;
      attachments?: boolean;
    },
  ) {
    return {
      ...request,
      building: include?.building
        ? (this.buildings.find(
            (building) => building.id === request.buildingId,
          ) ?? null)
        : undefined,
      unit: include?.unit
        ? (this.units.find((unit) => unit.id === request.unitId) ?? null)
        : undefined,
      createdByUser: include?.createdByUser
        ? (this.users.find((user) => user.id === request.createdByUserId) ??
          null)
        : undefined,
      assignedToUser: include?.assignedToUser
        ? (this.users.find((user) => user.id === request.assignedToUserId) ??
          null)
        : undefined,
      serviceProvider: include?.serviceProvider
        ? (this.serviceProviders.find(
            (provider) => provider.id === request.serviceProviderId,
          ) ?? null)
        : undefined,
      serviceProviderAssignedUser: include?.serviceProviderAssignedUser
        ? (this.users.find(
            (user) => user.id === request.serviceProviderAssignedUserId,
          ) ?? null)
        : undefined,
      attachments: include?.attachments
        ? this.attachments.filter(
            (attachment) => attachment.requestId === request.id,
          )
        : undefined,
    };
  }

  private hydrateComment(
    comment: CommentRecord,
    include?: { authorUser?: boolean; authorOwner?: boolean },
  ) {
    return {
      ...comment,
      authorUser: include?.authorUser
        ? (this.users.find((user) => user.id === comment.authorUserId) ?? null)
        : undefined,
      authorOwner: include?.authorOwner
        ? comment.authorOwnerId
          ? { id: comment.authorOwnerId }
          : null
        : undefined,
    };
  }

  reset() {
    this.orgs = [];
    this.users = [];
    this.buildings = [];
    this.units = [];
    this.assignments = [];
    this.occupancies = [];
    this.leases = [];
    this.requests = [];
    this.comments = [];
    this.commentReadStates = [];
    this.attachments = [];
    this.serviceProviders = [];
    this.serviceProviderBuildings = [];
    this.serviceProviderUsers = [];
    this.ownerApprovalAudits = [];
  }

  seedServiceProvider(input: {
    orgId: string;
    name: string;
    isActive?: boolean;
    serviceCategory?: string | null;
  }) {
    const now = new Date();
    const provider: ServiceProviderRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      name: input.name,
      serviceCategory: input.serviceCategory ?? null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      notes: null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.serviceProviders.push(provider);
    return provider;
  }

  seedServiceProviderBuilding(input: {
    serviceProviderId: string;
    buildingId: string;
  }) {
    const link: ServiceProviderBuildingRecord = {
      serviceProviderId: input.serviceProviderId,
      buildingId: input.buildingId,
      createdAt: new Date(),
    };
    this.serviceProviderBuildings.push(link);
    return link;
  }

  seedServiceProviderUser(input: {
    serviceProviderId: string;
    userId: string;
    role?: 'ADMIN' | 'WORKER';
    isActive?: boolean;
  }) {
    const now = new Date();
    const membership: ServiceProviderUserRecord = {
      serviceProviderId: input.serviceProviderId,
      userId: input.userId,
      role: input.role ?? 'WORKER',
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.serviceProviderUsers.push(membership);
    return membership;
  }

  setServiceProviderActive(serviceProviderId: string, isActive: boolean) {
    const provider = this.serviceProviders.find(
      (candidate) => candidate.id === serviceProviderId,
    );
    if (!provider) {
      throw new Error('Service provider not found');
    }
    provider.isActive = isActive;
    provider.updatedAt = new Date();
    return provider;
  }

  setServiceProviderUserActive(
    serviceProviderId: string,
    userId: string,
    isActive: boolean,
  ) {
    const membership = this.serviceProviderUsers.find(
      (candidate) =>
        candidate.serviceProviderId === serviceProviderId &&
        candidate.userId === userId,
    );
    if (!membership) {
      throw new Error('Service provider user link not found');
    }
    membership.isActive = isActive;
    membership.updatedAt = new Date();
    return membership;
  }

  listCommentReadStates(userId: string, scope: 'BUILDING' | 'PROVIDER') {
    return this.commentReadStates.filter(
      (state) => state.userId === userId && state.scope === scope,
    );
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
    if (!user) {
      return false;
    }

    request.user = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId ?? null,
    };
    return true;
  }
}

@Injectable()
class AllowPermissionsGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('Maintenance requests (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgAdminA: UserRecord;
  let orgAdminB: UserRecord;
  let managerA: UserRecord;
  let buildingAdminA: UserRecord;
  let staffA: UserRecord;
  let providerManagerA: UserRecord;
  let providerWorkerA: UserRecord;
  let residentA: UserRecord;
  let buildingA: BuildingRecord;
  let unitA1: UnitRecord;

  const permissionsByUser = accessPermissionsByUser;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [
        ResidentRequestsController,
        BuildingRequestsController,
        ProviderRequestsController,
      ],
      providers: [
        MaintenanceRequestsRepo,
        MaintenanceRequestsService,
        {
          provide: EventEmitter2,
          useValue: { emit: () => undefined },
        },
        OrgScopeGuard,
        BuildingAccessService,
        BuildingAccessGuard,
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (userId: string) =>
              permissionsByUser.get(userId) ?? new Set<string>(),
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
        {
          provide: ProviderAccessService,
          useValue: {
            getAccessibleProviderContext: async (userId: string) => {
              const memberships = await prisma.serviceProviderUser.findMany({
                where: {
                  userId,
                  isActive: true,
                  user: { isActive: true },
                  serviceProvider: { isActive: true },
                },
                include: {
                  serviceProvider: true,
                },
              });

              if (memberships.length === 0) {
                throw new ForbiddenException('Forbidden');
              }

              return {
                providerIds: new Set(
                  memberships.map((membership) => membership.serviceProviderId),
                ),
                adminProviderIds: new Set(
                  memberships
                    .filter((membership) => membership.role === 'ADMIN')
                    .map((membership) => membership.serviceProviderId),
                ),
                memberships,
              };
            },
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(AllowPermissionsGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    prisma.reset();
    permissionsByUser.clear();

    const orgA = await prisma.org.create({ data: { name: 'Org A' } });
    const orgB = await prisma.org.create({ data: { name: 'Org B' } });

    buildingA = await prisma.building.create({
      data: {
        orgId: orgA.id,
        name: 'A1',
        city: 'Dubai',
        emirate: 'Dubai',
        country: 'ARE',
        timezone: 'Asia/Dubai',
      },
    });
    await prisma.building.create({
      data: {
        orgId: orgB.id,
        name: 'B1',
        city: 'Abu Dhabi',
        emirate: 'Abu Dhabi',
        country: 'ARE',
        timezone: 'Asia/Dubai',
      },
    });

    unitA1 = await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-101' },
    });
    await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-102' },
    });

    orgAdminA = await prisma.user.create({
      data: {
        email: 'org-admin-a@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Org Admin A',
        isActive: true,
      },
    });
    orgAdminB = await prisma.user.create({
      data: {
        email: 'org-admin-b@org.test',
        passwordHash: 'hash',
        orgId: orgB.id,
        name: 'Org Admin B',
        isActive: true,
      },
    });
    managerA = await prisma.user.create({
      data: {
        email: 'manager@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Manager A',
        isActive: true,
      },
    });
    buildingAdminA = await prisma.user.create({
      data: {
        email: 'building-admin@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Building Admin A',
        isActive: true,
      },
    });
    staffA = await prisma.user.create({
      data: {
        email: 'staff@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Staff A',
        isActive: true,
      },
    });
    providerManagerA = await prisma.user.create({
      data: {
        email: 'provider-manager@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Provider Manager A',
        isActive: true,
      },
    });
    providerWorkerA = await prisma.user.create({
      data: {
        email: 'provider-worker@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Provider Worker A',
        isActive: true,
      },
    });
    residentA = await prisma.user.create({
      data: {
        email: 'resident@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Resident A',
        isActive: true,
      },
    });

    permissionsByUser.set(
      orgAdminA.id,
      new Set([
        'requests.read',
        'requests.assign',
        'requests.update_status',
        'requests.comment',
      ]),
    );
    permissionsByUser.set(
      orgAdminB.id,
      new Set([
        'requests.read',
        'requests.assign',
        'requests.update_status',
        'requests.comment',
      ]),
    );
    permissionsByUser.set(
      managerA.id,
      new Set([
        'requests.read',
        'requests.assign',
        'requests.update_status',
        'requests.comment',
      ]),
    );
    permissionsByUser.set(
      buildingAdminA.id,
      new Set([
        'requests.read',
        'requests.assign',
        'requests.update_status',
        'requests.comment',
      ]),
    );
    permissionsByUser.set(
      staffA.id,
      new Set(['requests.read', 'requests.update_status', 'requests.comment']),
    );

    await prisma.buildingAssignment.create({
      data: { buildingId: buildingA.id, userId: managerA.id, type: 'MANAGER' },
    });
    await prisma.buildingAssignment.create({
      data: {
        buildingId: buildingA.id,
        userId: buildingAdminA.id,
        type: 'BUILDING_ADMIN',
      },
    });
    await prisma.buildingAssignment.create({
      data: { buildingId: buildingA.id, userId: staffA.id, type: 'STAFF' },
    });

    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: residentA.id,
        status: 'ACTIVE',
      },
    });
  });

  it('resident creates and reads requests', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Leaky faucet',
        description: 'Kitchen sink dripping',
        emergencySignals: ['active leak', 'NO_POWER'],
        attachments: [
          {
            fileName: 'photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1234,
            url: 'https://example.com/photo.jpg',
          },
        ],
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.status).toBe('OPEN');
    expect(created.unit.id).toBe(unitA1.id);
    expect(created.requestTenancyContext).toMatchObject({
      label: 'CURRENT_OCCUPANCY',
      tenancyContextSource: 'SNAPSHOT',
    });
    expect(created.requestTenancyContext.occupancyIdAtCreation).toBe(
      created.requestTenancyContext.currentOccupancyId,
    );
    expect(prisma.getRequest(created.id)?.isEmergency).toBe(true);
    expect(prisma.getRequest(created.id)?.emergencySignals).toEqual([
      'ACTIVE_LEAK',
      'NO_POWER',
    ]);

    const listResponse = await fetch(`${baseUrl}/resident/requests`, {
      headers: { 'x-user-id': residentA.id },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(1);
    expect(listBody[0].requestTenancyContext).toMatchObject({
      label: 'CURRENT_OCCUPANCY',
      tenancyContextSource: 'SNAPSHOT',
    });

    const detailResponse = await fetch(
      `${baseUrl}/resident/requests/${created.id}`,
      { headers: { 'x-user-id': residentA.id } },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.id).toBe(created.id);
    expect(detailBody.requestTenancyContext).toMatchObject({
      label: 'CURRENT_OCCUPANCY',
      tenancyContextSource: 'SNAPSHOT',
    });
  });

  it('cross-org access returns 404', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Noise', description: 'Loud AC' }),
    });
    const created = await createResponse.json();

    const response = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}`,
      { headers: { 'x-user-id': orgAdminB.id } },
    );
    expect(response.status).toBe(404);
  });

  it('staff only sees assigned requests by default', async () => {
    await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Light out' }),
    });

    const listResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests`,
      { headers: { 'x-user-id': staffA.id } },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(0);
  });

  it('classifies clear minor intake as ready to assign', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Light bulb out',
        type: 'ELECTRICAL',
        priority: 'LOW',
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}`,
      { headers: { 'x-user-id': managerA.id } },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.policy).toMatchObject({
      route: 'DIRECT_ASSIGN',
      recommendation: 'PROCEED_NOW',
    });
    expect(detailBody.queue).toBe('READY_TO_ASSIGN');
  });

  it('classifies clear emergency intake as emergency dispatch', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Water leak causing damage',
        description: 'Flooding from the ceiling into the hallway',
        priority: 'HIGH',
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}`,
      { headers: { 'x-user-id': managerA.id } },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.policy).toMatchObject({
      route: 'EMERGENCY_DISPATCH',
      recommendation: 'PROCEED_AND_NOTIFY',
    });
    expect(detailBody.queue).toBe('READY_TO_ASSIGN');
  });

  it('classifies unclear intake into needs estimate', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Water heater issue',
        description: 'No hot water in the bathroom',
        type: 'PLUMBING_AC_HEATING',
        priority: 'HIGH',
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const detailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}`,
      { headers: { 'x-user-id': managerA.id } },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.policy).toMatchObject({
      route: 'NEEDS_ESTIMATE',
      recommendation: 'GET_ESTIMATE',
    });
    expect(detailBody.queue).toBe('NEEDS_ESTIMATE');
  });

  it('keeps resident and staff maintenance request flows working after owner portfolio additions', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Water heater issue',
        description: 'No hot water in the bathroom',
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const assignResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );
    expect(assignResponse.status).toBe(201);

    const residentListResponse = await fetch(`${baseUrl}/resident/requests`, {
      headers: { 'x-user-id': residentA.id },
    });
    expect(residentListResponse.status).toBe(200);
    const residentListBody = await residentListResponse.json();
    expect(residentListBody).toEqual([
      expect.objectContaining({
        id: created.id,
        status: 'ASSIGNED',
      }),
    ]);

    const staffListResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests`,
      { headers: { 'x-user-id': staffA.id } },
    );
    expect(staffListResponse.status).toBe(200);
    const staffListBody = await staffListResponse.json();
    expect(staffListBody).toEqual([
      expect.objectContaining({
        id: created.id,
        status: 'ASSIGNED',
      }),
    ]);

    const residentDetailResponse = await fetch(
      `${baseUrl}/resident/requests/${created.id}`,
      { headers: { 'x-user-id': residentA.id } },
    );
    expect(residentDetailResponse.status).toBe(200);
    const residentDetailBody = await residentDetailResponse.json();
    expect(residentDetailBody).toMatchObject({
      id: created.id,
      status: 'ASSIGNED',
    });
  });

  it('manager and building admin can assign requests', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Door jammed' }),
    });
    const created = await createResponse.json();

    const managerAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );
    expect(managerAssign.status).toBe(201);

    const secondResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Broken window' }),
    });
    const second = await secondResponse.json();

    const buildingAdminAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${second.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': buildingAdminA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );
    expect(buildingAdminAssign.status).toBe(201);
  });

  it('manager can reassign an assigned request', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Reassign test' }),
    });
    const created = await createResponse.json();

    const firstAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );
    expect(firstAssign.status).toBe(201);

    const otherStaff = await prisma.user.create({
      data: {
        email: 'staff2@org.test',
        passwordHash: 'hash',
        orgId: orgAdminA.orgId,
        name: 'Staff B',
        isActive: true,
      },
    });

    await prisma.buildingAssignment.create({
      data: { buildingId: buildingA.id, userId: otherStaff.id, type: 'STAFF' },
    });

    const secondAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ staffUserId: otherStaff.id }),
      },
    );
    expect(secondAssign.status).toBe(201);
  });

  it('manager can assign a request to a linked service provider and dispatch a provider worker', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
      serviceCategory: 'Plumbing',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Vendor dispatch test' }),
    });
    const created = await createResponse.json();

    const providerAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );
    expect(providerAssign.status).toBe(201);
    const providerBody = await providerAssign.json();
    expect(providerBody).toMatchObject({
      id: created.id,
      status: 'ASSIGNED',
      assignedTo: null,
      serviceProvider: {
        id: provider.id,
        name: 'RapidFix',
        serviceCategory: 'Plumbing',
      },
      serviceProviderAssignedTo: null,
    });

    const workerAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider-worker`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ userId: providerWorkerA.id }),
      },
    );
    expect(workerAssign.status).toBe(201);
    const workerBody = await workerAssign.json();
    expect(workerBody).toMatchObject({
      id: created.id,
      serviceProvider: {
        id: provider.id,
      },
      serviceProviderAssignedTo: {
        id: providerWorkerA.id,
        email: providerWorkerA.email,
      },
    });
  });

  it('reassigning to staff clears service provider assignment state', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Clear provider on staff assign' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider-worker`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ userId: providerWorkerA.id }),
      },
    );

    const staffAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );
    expect(staffAssign.status).toBe(201);
    const assigned = await staffAssign.json();
    expect(assigned).toMatchObject({
      id: created.id,
      assignedTo: {
        id: staffA.id,
      },
      serviceProvider: null,
      serviceProviderAssignedTo: null,
    });
  });

  it('provider assignment is blocked while owner approval is pending', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Pending owner approval provider block' }),
    });
    const created = await createResponse.json();

    const requireApproval = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/owner-approval/require`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({
          approvalRequiredReason: 'Owner must approve vendor spend',
        }),
      },
    );
    expect(requireApproval.status).toBe(201);

    const providerAssign = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );
    expect(providerAssign.status).toBe(409);
  });

  it('reassigning provider clears prior provider worker assignment and unlinking reopens the request', async () => {
    const providerA = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    const providerB = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'PrimeWorks',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: providerA.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: providerB.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: providerA.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: providerB.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Reassign provider request' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: providerA.id }),
      },
    );
    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider-worker`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ userId: providerWorkerA.id }),
      },
    );

    const reassignProvider = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: providerB.id }),
      },
    );
    expect(reassignProvider.status).toBe(201);
    const reassigned = await reassignProvider.json();
    expect(reassigned).toMatchObject({
      id: created.id,
      serviceProvider: {
        id: providerB.id,
      },
      serviceProviderAssignedTo: null,
    });

    const unassignProvider = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/unassign-provider`,
      {
        method: 'POST',
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(unassignProvider.status).toBe(201);
    const unassigned = await unassignProvider.json();
    expect(unassigned).toMatchObject({
      id: created.id,
      status: 'OPEN',
      serviceProvider: null,
      serviceProviderAssignedTo: null,
    });
  });

  it('provider manager can list and read only requests for managed providers', async () => {
    const providerA = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
      serviceCategory: 'Plumbing',
    });
    const providerB = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'PrimeWorks',
      serviceCategory: 'Electrical',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: providerA.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: providerB.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: providerA.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });

    const firstResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Provider A request' }),
    });
    const first = await firstResponse.json();

    const secondResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Provider B request' }),
    });
    const second = await secondResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${first.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: providerA.id }),
      },
    );
    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${second.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: providerB.id }),
      },
    );

    const listResponse = await fetch(`${baseUrl}/provider/requests`, {
      headers: { 'x-user-id': providerManagerA.id },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(1);
    expect(listBody[0]).toMatchObject({
      id: first.id,
      buildingId: buildingA.id,
      buildingName: buildingA.name,
      serviceProvider: {
        id: providerA.id,
        name: 'RapidFix',
        serviceCategory: 'Plumbing',
      },
    });

    const filteredListResponse = await fetch(
      `${baseUrl}/provider/requests?serviceProviderId=${providerA.id}`,
      {
        headers: { 'x-user-id': providerManagerA.id },
      },
    );
    expect(filteredListResponse.status).toBe(200);

    const forbiddenFilterResponse = await fetch(
      `${baseUrl}/provider/requests?serviceProviderId=${providerB.id}`,
      {
        headers: { 'x-user-id': providerManagerA.id },
      },
    );
    expect(forbiddenFilterResponse.status).toBe(403);

    const detailResponse = await fetch(
      `${baseUrl}/provider/requests/${first.id}`,
      {
        headers: { 'x-user-id': providerManagerA.id },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody).toMatchObject({
      id: first.id,
      buildingId: buildingA.id,
      buildingName: buildingA.name,
      serviceProvider: {
        id: providerA.id,
      },
    });

    const otherDetailResponse = await fetch(
      `${baseUrl}/provider/requests/${second.id}`,
      {
        headers: { 'x-user-id': providerManagerA.id },
      },
    );
    expect(otherDetailResponse.status).toBe(404);
  });

  it('provider worker can view provider requests but cannot write until assigned, then can update', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Provider worker flow' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );

    const listResponse = await fetch(`${baseUrl}/provider/requests`, {
      headers: { 'x-user-id': providerWorkerA.id },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(1);
    expect(listBody[0].id).toBe(created.id);

    const detailResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}`,
      {
        headers: { 'x-user-id': providerWorkerA.id },
      },
    );
    expect(detailResponse.status).toBe(200);

    const statusDenied = await fetch(
      `${baseUrl}/provider/requests/${created.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      },
    );
    expect(statusDenied.status).toBe(403);

    const commentDenied = await fetch(
      `${baseUrl}/provider/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({ message: 'Starting work' }),
      },
    );
    expect(commentDenied.status).toBe(403);

    const attachmentsDenied = await fetch(
      `${baseUrl}/provider/requests/${created.id}/attachments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({
          attachments: [
            {
              fileName: 'before.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 123,
              url: 'https://example.test/before.jpg',
            },
          ],
        }),
      },
    );
    expect(attachmentsDenied.status).toBe(403);

    const providerAssignWorker = await fetch(
      `${baseUrl}/provider/requests/${created.id}/assign-worker`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerManagerA.id,
        },
        body: JSON.stringify({ userId: providerWorkerA.id }),
      },
    );
    expect(providerAssignWorker.status).toBe(201);
    const assignedBody = await providerAssignWorker.json();
    expect(assignedBody).toMatchObject({
      id: created.id,
      buildingId: buildingA.id,
      serviceProviderAssignedTo: {
        id: providerWorkerA.id,
      },
    });

    const statusUpdate = await fetch(
      `${baseUrl}/provider/requests/${created.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      },
    );
    expect(statusUpdate.status).toBe(201);
    const statusBody = await statusUpdate.json();
    expect(statusBody).toMatchObject({
      id: created.id,
      status: 'IN_PROGRESS',
      buildingId: buildingA.id,
    });

    const commentResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({ message: 'Work has started' }),
      },
    );
    expect(commentResponse.status).toBe(201);
    const commentBody = await commentResponse.json();
    expect(commentBody).toMatchObject({
      requestId: created.id,
      author: {
        id: providerWorkerA.id,
        type: 'STAFF',
      },
      visibility: 'SHARED',
      message: 'Work has started',
    });

    const attachmentsResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}/attachments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({
          attachments: [
            {
              fileName: 'after.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 456,
              url: 'https://example.test/after.jpg',
            },
          ],
        }),
      },
    );
    expect(attachmentsResponse.status).toBe(201);
    const attachmentsBody = await attachmentsResponse.json();
    expect(attachmentsBody).toMatchObject({
      id: created.id,
      buildingId: buildingA.id,
    });
    expect(attachmentsBody.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'after.jpg',
          url: 'https://example.test/after.jpg',
        }),
      ]),
    );
  });

  it('provider admin can submit an estimate that auto-starts owner approval', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Provider estimate approval flow',
        description: 'Water heater replacement required',
      }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );

    const estimateResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}/estimate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerManagerA.id,
        },
        body: JSON.stringify({
          estimatedAmount: 1750,
          estimatedCurrency: 'aed',
        }),
      },
    );
    expect(estimateResponse.status).toBe(201);
    const estimateBody = await estimateResponse.json();
    expect(estimateBody.ownerApproval).toMatchObject({
      status: 'PENDING',
      requiredReason: 'Estimate exceeds owner approval threshold',
      estimatedAmount: '1750',
      estimatedCurrency: 'AED',
      requestedByUserId: providerManagerA.id,
    });

    const managerDetailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}`,
      { headers: { 'x-user-id': managerA.id } },
    );
    expect(managerDetailResponse.status).toBe(200);
    const managerDetailBody = await managerDetailResponse.json();
    expect(managerDetailBody.policy).toMatchObject({
      route: 'OWNER_APPROVAL_REQUIRED',
      recommendation: 'REQUEST_OWNER_APPROVAL',
    });
    expect(managerDetailBody.queue).toBe('AWAITING_OWNER');
  });

  it('management can request a provider estimate while keeping the request in needs-estimate', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'AC not cooling',
        description: 'No cold air from living room vent',
        type: 'PLUMBING_AC_HEATING',
        priority: 'HIGH',
      }),
    });
    const created = await createResponse.json();

    const requestEstimateResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/request-estimate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );
    expect(requestEstimateResponse.status).toBe(201);
    const requestEstimateBody = await requestEstimateResponse.json();
    expect(requestEstimateBody).toMatchObject({
      id: created.id,
      status: 'OPEN',
      assignedTo: null,
      estimate: {
        status: 'REQUESTED',
        requestedByUserId: managerA.id,
      },
      serviceProvider: {
        id: provider.id,
      },
      serviceProviderAssignedTo: null,
    });
    expect(requestEstimateBody.policy).toMatchObject({
      route: 'NEEDS_ESTIMATE',
      recommendation: 'GET_ESTIMATE',
    });
    expect(requestEstimateBody.estimate.dueAt).toEqual(expect.any(String));
    expect(requestEstimateBody.queue).toBe('AWAITING_ESTIMATE');

    const providerDetailResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}`,
      {
        headers: { 'x-user-id': providerManagerA.id },
      },
    );
    expect(providerDetailResponse.status).toBe(200);
    const providerDetailBody = await providerDetailResponse.json();
    expect(providerDetailBody).toMatchObject({
      id: created.id,
      estimate: {
        status: 'REQUESTED',
        requestedByUserId: managerA.id,
      },
      serviceProvider: {
        id: provider.id,
      },
      ownerApproval: {
        status: 'NOT_REQUIRED',
      },
    });
  });

  it('provider worker can submit estimate only after worker assignment', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Provider worker estimate flow',
        description: 'AC not cooling',
      }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );

    const deniedEstimate = await fetch(
      `${baseUrl}/provider/requests/${created.id}/estimate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({
          estimatedAmount: 650,
          estimatedCurrency: 'aed',
          isLikeForLike: true,
        }),
      },
    );
    expect(deniedEstimate.status).toBe(403);

    await fetch(`${baseUrl}/provider/requests/${created.id}/assign-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': providerManagerA.id,
      },
      body: JSON.stringify({ userId: providerWorkerA.id }),
    });

    const estimateResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}/estimate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({
          estimatedAmount: 650,
          estimatedCurrency: 'aed',
          isLikeForLike: true,
        }),
      },
    );
    expect(estimateResponse.status).toBe(201);
    const estimateBody = await estimateResponse.json();
    expect(estimateBody.ownerApproval).toMatchObject({
      status: 'NOT_REQUIRED',
      estimatedAmount: '650',
      estimatedCurrency: 'AED',
    });

    const managerDetailResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}`,
      { headers: { 'x-user-id': managerA.id } },
    );
    expect(managerDetailResponse.status).toBe(200);
    const managerDetailBody = await managerDetailResponse.json();
    expect(managerDetailBody.policy).toMatchObject({
      route: 'DIRECT_ASSIGN',
      recommendation: 'PROCEED_NOW',
    });
    expect(managerDetailBody.estimate).toMatchObject({
      status: 'SUBMITTED',
      submittedByUserId: providerWorkerA.id,
    });
    expect(managerDetailBody.queue).toBe('ASSIGNED');
  });

  it('estimate-requested state blocks execution assignment until an estimate is submitted', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'AC not cooling',
        description: 'No cold air from living room vent',
        type: 'PLUMBING_AC_HEATING',
        priority: 'HIGH',
      }),
    });
    const created = await createResponse.json();

    const requestEstimateResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/request-estimate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );
    expect(requestEstimateResponse.status).toBe(201);

    const assignStaffResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );
    expect(assignStaffResponse.status).toBe(409);
    const assignStaffBody = await assignStaffResponse.json();
    expect(assignStaffBody.message).toBe(
      'Request is blocked pending estimate submission',
    );

    const reassignProviderResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );
    expect(reassignProviderResponse.status).toBe(409);
  });

  it('provider comments only expose shared entries and unrelated providers cannot access the request', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    const otherProvider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'PrimeWorks',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: otherProvider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const otherProviderManager = await prisma.user.create({
      data: {
        email: 'provider-manager-2@org.test',
        passwordHash: 'hash',
        orgId: orgAdminA.orgId,
        name: 'Provider Manager B',
        isActive: true,
      },
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: otherProvider.id,
      userId: otherProviderManager.id,
      role: 'ADMIN',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Comment visibility request' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );
    await fetch(`${baseUrl}/provider/requests/${created.id}/assign-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': providerManagerA.id,
      },
      body: JSON.stringify({ userId: providerWorkerA.id }),
    });

    const sharedComment = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({
          message: 'Main valve inspection approved',
          visibility: 'SHARED',
        }),
      },
    );
    expect(sharedComment.status).toBe(201);

    const internalComment = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({
          message: 'Budget note for internal tracking',
          visibility: 'INTERNAL',
        }),
      },
    );
    expect(internalComment.status).toBe(201);

    const providerComment = await fetch(
      `${baseUrl}/provider/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({ message: 'Technician is on site' }),
      },
    );
    expect(providerComment.status).toBe(201);

    const commentsResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}/comments`,
      {
        headers: { 'x-user-id': providerWorkerA.id },
      },
    );
    expect(commentsResponse.status).toBe(200);
    const commentsBody = await commentsResponse.json();
    expect(commentsBody).toHaveLength(2);
    expect(commentsBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Main valve inspection approved',
          visibility: 'SHARED',
        }),
        expect.objectContaining({
          message: 'Technician is on site',
          visibility: 'SHARED',
        }),
      ]),
    );
    expect(commentsBody).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          message: 'Budget note for internal tracking',
        }),
      ]),
    );

    const unrelatedResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}`,
      {
        headers: { 'x-user-id': otherProviderManager.id },
      },
    );
    expect(unrelatedResponse.status).toBe(404);
  });

  it('tracks unread provider comments using shared visibility only', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'FlowRight Plumbing',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Unread provider comments' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );

    const sharedComment = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({
          message: 'Visible provider update',
          visibility: 'SHARED',
        }),
      },
    );
    expect(sharedComment.status).toBe(201);

    const internalComment = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({
          message: 'Hidden internal note',
          visibility: 'INTERNAL',
        }),
      },
    );
    expect(internalComment.status).toBe(201);

    const initialCountResponse = await fetch(
      `${baseUrl}/provider/requests/comments/unread-count`,
      {
        headers: { 'x-user-id': providerWorkerA.id },
      },
    );
    expect(initialCountResponse.status).toBe(200);
    await expect(initialCountResponse.json()).resolves.toEqual({
      unreadCount: 1,
    });

    const listCommentsResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}/comments`,
      {
        headers: { 'x-user-id': providerWorkerA.id },
      },
    );
    expect(listCommentsResponse.status).toBe(200);

    const afterReadCountResponse = await fetch(
      `${baseUrl}/provider/requests/comments/unread-count`,
      {
        headers: { 'x-user-id': providerWorkerA.id },
      },
    );
    expect(afterReadCountResponse.status).toBe(200);
    await expect(afterReadCountResponse.json()).resolves.toEqual({
      unreadCount: 0,
    });

    expect(
      prisma.listCommentReadStates(providerWorkerA.id, 'PROVIDER'),
    ).toEqual([
      expect.objectContaining({
        requestId: created.id,
      }),
    ]);
  });

  it('inactive provider membership removes provider-side access immediately', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Membership cutoff request' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );
    await fetch(`${baseUrl}/provider/requests/${created.id}/assign-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': providerManagerA.id,
      },
      body: JSON.stringify({ userId: providerWorkerA.id }),
    });

    prisma.setServiceProviderUserActive(
      provider.id,
      providerManagerA.id,
      false,
    );
    prisma.setServiceProviderUserActive(provider.id, providerWorkerA.id, false);

    const managerListResponse = await fetch(`${baseUrl}/provider/requests`, {
      headers: { 'x-user-id': providerManagerA.id },
    });
    expect(managerListResponse.status).toBe(403);

    const workerDetailResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}`,
      {
        headers: { 'x-user-id': providerWorkerA.id },
      },
    );
    expect(workerDetailResponse.status).toBe(403);

    const workerStatusResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': providerWorkerA.id,
        },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      },
    );
    expect(workerStatusResponse.status).toBe(403);
  });

  it('inactive provider removes provider-side access immediately', async () => {
    const provider = prisma.seedServiceProvider({
      orgId: orgAdminA.orgId!,
      name: 'RapidFix',
    });
    prisma.seedServiceProviderBuilding({
      serviceProviderId: provider.id,
      buildingId: buildingA.id,
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerManagerA.id,
      role: 'ADMIN',
    });
    prisma.seedServiceProviderUser({
      serviceProviderId: provider.id,
      userId: providerWorkerA.id,
      role: 'WORKER',
    });

    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Provider cutoff request' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ serviceProviderId: provider.id }),
      },
    );

    prisma.setServiceProviderActive(provider.id, false);

    const managerListResponse = await fetch(`${baseUrl}/provider/requests`, {
      headers: { 'x-user-id': providerManagerA.id },
    });
    expect(managerListResponse.status).toBe(403);

    const managerDetailResponse = await fetch(
      `${baseUrl}/provider/requests/${created.id}`,
      {
        headers: { 'x-user-id': providerManagerA.id },
      },
    );
    expect(managerDetailResponse.status).toBe(403);

    const buildingAssignWorkerResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign-provider-worker`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ userId: providerWorkerA.id }),
      },
    );
    expect(buildingAssignWorkerResponse.status).toBe(400);
  });

  it('staff updates status only when assigned', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'AC noise' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': buildingAdminA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );

    const inProgress = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': staffA.id,
        },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      },
    );
    expect(inProgress.status).toBe(201);

    const completed = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': staffA.id,
        },
        body: JSON.stringify({ status: 'COMPLETED' }),
      },
    );
    expect(completed.status).toBe(201);
  });

  it('manager can update status without permission', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Elevator stuck' }),
    });
    const created = await createResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': buildingAdminA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );

    const managerDenied = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      },
    );
    expect(managerDenied.status).toBe(201);
  });

  it('manager can cancel requests', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Cancel test' }),
    });
    const created = await createResponse.json();

    const cancelResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
      },
    );
    expect(cancelResponse.status).toBe(201);
    const cancelBody = await cancelResponse.json();
    expect(cancelBody.status).toBe('CANCELED');
  });

  it('comments respect assignment rules', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Hallway light' }),
    });
    const created = await createResponse.json();

    const residentComment = await fetch(
      `${baseUrl}/resident/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': residentA.id,
        },
        body: JSON.stringify({ message: 'Please fix soon' }),
      },
    );
    expect(residentComment.status).toBe(201);

    const staffCommentDenied = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': staffA.id,
        },
        body: JSON.stringify({ message: 'Checking' }),
      },
    );
    expect(staffCommentDenied.status).toBe(403);

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': buildingAdminA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );

    const staffComment = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': staffA.id,
        },
        body: JSON.stringify({ message: 'Assigned and working' }),
      },
    );
    expect(staffComment.status).toBe(201);
  });

  it('tracks unread building comments for visible requests and clears them after comment read', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Unread building comments' }),
    });
    const created = await createResponse.json();

    const residentComment = await fetch(
      `${baseUrl}/resident/requests/${created.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': residentA.id,
        },
        body: JSON.stringify({ message: 'Please update me' }),
      },
    );
    expect(residentComment.status).toBe(201);

    const initialCountResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/comments/unread-count`,
      {
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(initialCountResponse.status).toBe(200);
    await expect(initialCountResponse.json()).resolves.toEqual({
      unreadCount: 1,
    });

    const listCommentsResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${created.id}/comments`,
      {
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(listCommentsResponse.status).toBe(200);

    const afterReadCountResponse = await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/comments/unread-count`,
      {
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(afterReadCountResponse.status).toBe(200);
    await expect(afterReadCountResponse.json()).resolves.toEqual({
      unreadCount: 0,
    });

    expect(prisma.listCommentReadStates(managerA.id, 'BUILDING')).toEqual([
      expect.objectContaining({
        requestId: created.id,
      }),
    ]);
  });

  it('resident can cancel open request but not completed', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Noise in lobby' }),
    });
    const created = await createResponse.json();

    const cancelResponse = await fetch(
      `${baseUrl}/resident/requests/${created.id}/cancel`,
      {
        method: 'POST',
        headers: { 'x-user-id': residentA.id },
      },
    );
    expect(cancelResponse.status).toBe(201);

    const secondResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Broken pipe' }),
    });
    const second = await secondResponse.json();

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${second.id}/assign`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': buildingAdminA.id,
        },
        body: JSON.stringify({ staffUserId: staffA.id }),
      },
    );

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${second.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': staffA.id,
        },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      },
    );

    await fetch(
      `${baseUrl}/org/buildings/${buildingA.id}/requests/${second.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': staffA.id,
        },
        body: JSON.stringify({ status: 'COMPLETED' }),
      },
    );

    const cancelCompleted = await fetch(
      `${baseUrl}/resident/requests/${second.id}/cancel`,
      {
        method: 'POST',
        headers: { 'x-user-id': residentA.id },
      },
    );
    expect(cancelCompleted.status).toBe(409);
  });

  it('hides former resident request history until the same user becomes active again', async () => {
    const formerResident = await prisma.user.create({
      data: {
        email: 'former-resident@org.test',
        passwordHash: 'hash',
        name: 'Former Resident',
        orgId: buildingA.orgId,
        mustChangePassword: false,
        isActive: true,
      },
    });
    permissionsByUser.set(
      formerResident.id,
      new Set([
        'resident.requests.read',
        'resident.requests.update',
        'resident.requests.cancel',
        'resident.requests.comment',
      ]),
    );

    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: formerResident.id,
        status: 'ENDED',
      },
    });

    const legacyRequest = await prisma.maintenanceRequest.create({
      data: {
        org: { connect: { id: buildingA.orgId } },
        building: { connect: { id: buildingA.id } },
        unit: { connect: { id: unitA1.id } },
        createdByUser: { connect: { id: formerResident.id } },
        title: 'Old resident request',
        description: 'Created before move-out.',
        status: 'OPEN',
      },
    });

    const formerList = await fetch(`${baseUrl}/resident/requests`, {
      headers: { 'x-user-id': formerResident.id },
    });
    expect(formerList.status).toBe(403);

    const formerDetail = await fetch(
      `${baseUrl}/resident/requests/${legacyRequest.id}`,
      {
        headers: { 'x-user-id': formerResident.id },
      },
    );
    expect(formerDetail.status).toBe(403);

    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: formerResident.id,
        status: 'ACTIVE',
      },
    });

    const restoredList = await fetch(`${baseUrl}/resident/requests`, {
      headers: { 'x-user-id': formerResident.id },
    });
    expect(restoredList.status).toBe(200);
    const restoredPayload = await restoredList.json();
    expect(restoredPayload).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: legacyRequest.id })]),
    );

    const restoredComment = await fetch(
      `${baseUrl}/resident/requests/${legacyRequest.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': formerResident.id,
        },
        body: JSON.stringify({ message: 'I can access this again.' }),
      },
    );
    expect(restoredComment.status).toBe(201);
  });
});

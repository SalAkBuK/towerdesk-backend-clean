import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { BuildingAccessGuard } from '../src/common/guards/building-access.guard';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { BuildingScopeResolverService } from '../src/common/building-access/building-scope-resolver.service';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { MaintenanceRequestsRepo } from '../src/modules/maintenance-requests/maintenance-requests.repo';
import { MaintenanceRequestsService } from '../src/modules/maintenance-requests/maintenance-requests.service';
import { ResidentRequestsController } from '../src/modules/maintenance-requests/resident-requests.controller';
import { BuildingRequestsController } from '../src/modules/maintenance-requests/building-requests.controller';
import { NotificationsController } from '../src/modules/notifications/notifications.controller';
import { NotificationsRepo } from '../src/modules/notifications/notifications.repo';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationTypeEnum } from '../src/modules/notifications/notifications.constants';
import { NotificationsListener } from '../src/modules/notifications/notifications.listener';
import { NotificationRecipientResolver } from '../src/modules/notifications/notification-recipient.resolver';
import { NotificationsRealtimeService } from '../src/modules/notifications/notifications-realtime.service';
import { PushNotificationsService } from '../src/modules/notifications/push-notifications.service';
import { ProviderAccessService } from '../src/modules/service-providers/provider-access.service';

type OrgRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

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
  occupancyId?: string | null;
  residentUserId?: string | null;
  status: 'ACTIVE' | 'ENDED' | 'DRAFT';
  leaseStartDate: Date;
  leaseEndDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ResidentProfileRecord = {
  id: string;
  orgId: string;
  userId: string;
};

type ResidentInviteRecord = {
  id: string;
  orgId: string;
  userId: string;
  status: 'PENDING' | 'ACCEPTED' | 'FAILED';
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
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
  priority?: string | null;
  type?: string | null;
  isEmergency?: boolean;
  emergencySignals?: string[];
  assignedToUserId?: string | null;
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

type NotificationRecord = {
  id: string;
  orgId: string;
  recipientUserId: string;
  type: NotificationTypeEnum;
  title: string;
  body?: string | null;
  data: Record<string, unknown>;
  readAt?: Date | null;
  dismissedAt?: Date | null;
  createdAt: Date;
};

type NotificationListItem = {
  id: string;
  type: NotificationTypeEnum;
  title: string;
  body?: string | null;
  data: Record<string, unknown>;
  readAt?: string | null;
  dismissedAt?: string | null;
  createdAt: string;
};

type OlderNotificationCursorFilter = {
  createdAt?: { lt: Date };
};

type SameTimestampNotificationCursorFilter = {
  createdAt?: Date;
  id?: { lt: string };
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
  private notifications: NotificationRecord[] = [];

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
    findMany: async ({
      where,
    }: {
      where?: { orgId?: string; isActive?: boolean; userRoles?: unknown };
    }) => {
      return this.users.filter((user) => {
        if (where?.orgId && user.orgId !== where.orgId) {
          return false;
        }
        if (where?.isActive !== undefined && user.isActive !== where.isActive) {
          return false;
        }
        return true;
      });
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
      include,
    }: {
      where: { buildingId: string; userId?: string; type?: { in: string[] } };
      include?: { user?: boolean };
    }) => {
      const results = this.assignments.filter((assignment) => {
        if (assignment.buildingId !== where.buildingId) {
          return false;
        }
        if (where.userId && assignment.userId !== where.userId) {
          return false;
        }
        if (where.type?.in && !where.type.in.includes(assignment.type)) {
          return false;
        }
        return true;
      });
      return results.map((assignment) => ({
        ...assignment,
        user: include?.user
          ? (this.users.find((user) => user.id === assignment.userId) ?? null)
          : undefined,
      }));
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
          key?: { in: string[] };
        };
      };
      include?: {
        user?: boolean;
        roleTemplate?: {
          include?: {
            rolePermissions?: {
              include?: { permission?: boolean };
            };
          };
        };
      };
    }) => {
      const roleKeys = where.roleTemplate?.key?.in ?? [];
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

          const roleKey =
            assignment.type === 'MANAGER'
              ? 'building_manager'
              : assignment.type === 'BUILDING_ADMIN'
                ? 'building_admin'
                : 'building_staff';
          if (roleKeys.length > 0 && !roleKeys.includes(roleKey)) {
            return false;
          }
          return true;
        })
        .map((assignment) => {
          const building = this.buildings.find(
            (candidate) => candidate.id === assignment.buildingId,
          )!;
          const roleKey =
            assignment.type === 'MANAGER'
              ? 'building_manager'
              : assignment.type === 'BUILDING_ADMIN'
                ? 'building_admin'
                : 'building_staff';
          return {
            id: randomUUID(),
            userId: assignment.userId,
            scopeType: 'BUILDING',
            scopeId: assignment.buildingId,
            roleTemplate: {
              id: randomUUID(),
              orgId: building.orgId,
              key: roleKey,
              scopeType: 'BUILDING',
              rolePermissions: (assignment.type === 'STAFF'
                ? [
                    'requests.read',
                    'requests.update_status',
                    'requests.comment',
                  ]
                : [
                    'requests.read',
                    'requests.assign',
                    'requests.update_status',
                    'requests.comment',
                  ]
              ).map((key) => ({
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
        status?: { not?: 'DRAFT' } | 'ACTIVE';
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
        if (typeof where.status === 'string' && lease.status !== where.status) {
          return false;
        }
        if (
          typeof where.status === 'object' &&
          where.status.not === 'DRAFT' &&
          lease.status === 'DRAFT'
        ) {
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
        status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
        priority?: string | null;
        type?: string | null;
        isEmergency?: boolean;
        emergencySignals?: string[];
      };
      include?: {
        unit?: boolean;
        assignedToUser?: boolean;
        attachments?: boolean;
        createdByUser?: boolean;
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
        assignedAt: null,
        completedAt: null,
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.requests.push(request);
      return this.hydrateRequest(request, include);
    },
    findFirst: async ({
      where,
      include,
    }: {
      where: {
        id: string;
        orgId: string;
        buildingId?: string;
        createdByUserId?: string;
      };
      include?: {
        unit?: boolean;
        createdByUser?: boolean;
        assignedToUser?: boolean;
        attachments?: boolean;
      };
    }) => {
      const request =
        this.requests.find(
          (req) =>
            req.id === where.id &&
            req.orgId === where.orgId &&
            (where.buildingId ? req.buildingId === where.buildingId : true) &&
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
        status?: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
        assignedAt?: Date | null;
        completedAt?: Date | null;
        canceledAt?: Date | null;
        assignedToUser?: { connect: { id: string } };
      };
      include?: {
        unit?: boolean;
        createdByUser?: boolean;
        assignedToUser?: boolean;
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
        request.assignedToUserId = data.assignedToUser.connect.id;
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
  };

  notification = {
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        recipientUserId: string;
        type: NotificationTypeEnum;
        title: string;
        body?: string | null;
        data: Record<string, unknown>;
        createdAt?: Date;
      };
    }) => {
      const now = data.createdAt ?? new Date();
      const record: NotificationRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        recipientUserId: data.recipientUserId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        data: data.data,
        readAt: null,
        dismissedAt: null,
        createdAt: now,
      };
      this.notifications.push(record);
      return record;
    },
    createMany: async ({
      data,
    }: {
      data: {
        orgId: string;
        recipientUserId: string;
        type: NotificationTypeEnum;
        title: string;
        body?: string | null;
        data: Record<string, unknown>;
      }[];
    }) => {
      const now = new Date();
      for (const notification of data) {
        const record: NotificationRecord = {
          id: randomUUID(),
          orgId: notification.orgId,
          recipientUserId: notification.recipientUserId,
          type: notification.type,
          title: notification.title,
          body: notification.body ?? null,
          data: notification.data,
          readAt: null,
          dismissedAt: null,
          createdAt: now,
        };
        this.notifications.push(record);
      }
      return { count: data.length };
    },
    count: async ({
      where,
    }: {
      where: {
        recipientUserId: string;
        orgId: string;
        readAt?: null;
        dismissedAt?: null;
      };
    }) => {
      return this.notifications.filter((notification) => {
        if (notification.recipientUserId !== where.recipientUserId) {
          return false;
        }
        if (notification.orgId !== where.orgId) {
          return false;
        }
        if (where.readAt === null && notification.readAt !== null) {
          return false;
        }
        if (where.dismissedAt === null && notification.dismissedAt !== null) {
          return false;
        }
        return true;
      }).length;
    },
    findFirst: async ({
      where,
    }: {
      where: { id: string; recipientUserId: string; orgId: string };
    }) => {
      return (
        this.notifications.find(
          (notification) =>
            notification.id === where.id &&
            notification.recipientUserId === where.recipientUserId &&
            notification.orgId === where.orgId,
        ) ?? null
      );
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: {
        orgId: string;
        recipientUserId: string;
        type?: NotificationTypeEnum;
        readAt?: null;
        dismissedAt?: null;
        OR?: [
          OlderNotificationCursorFilter,
          SameTimestampNotificationCursorFilter,
        ];
      };
      orderBy?: Array<Record<string, 'asc' | 'desc'>>;
      take?: number;
    }) => {
      let results = this.notifications.filter(
        (notification) =>
          notification.orgId === where.orgId &&
          notification.recipientUserId === where.recipientUserId,
      );
      if (where.type) {
        results = results.filter(
          (notification) => notification.type === where.type,
        );
      }
      if (where.readAt === null) {
        results = results.filter(
          (notification) => notification.readAt === null,
        );
      }
      if (where.dismissedAt === null) {
        results = results.filter(
          (notification) => notification.dismissedAt === null,
        );
      }
      if (where.OR) {
        const [older, same] = where.OR;
        results = results.filter((notification) => {
          if (older?.createdAt?.lt) {
            if (notification.createdAt < older.createdAt.lt) {
              return true;
            }
          }
          if (same?.createdAt && same?.id?.lt) {
            return (
              notification.createdAt.getTime() === same.createdAt.getTime() &&
              notification.id < same.id.lt
            );
          }
          return false;
        });
      }
      if (orderBy) {
        results = [...results].sort((a, b) => {
          for (const order of orderBy) {
            if (order.createdAt) {
              const diff =
                order.createdAt === 'desc'
                  ? b.createdAt.getTime() - a.createdAt.getTime()
                  : a.createdAt.getTime() - b.createdAt.getTime();
              if (diff !== 0) {
                return diff;
              }
            }
            if (order.id) {
              if (a.id === b.id) {
                continue;
              }
              return order.id === 'desc'
                ? b.id.localeCompare(a.id)
                : a.id.localeCompare(b.id);
            }
          }
          return 0;
        });
      }
      if (take !== undefined) {
        results = results.slice(0, take);
      }
      return results;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id?: string;
        recipientUserId: string;
        orgId: string;
        readAt?: null;
        dismissedAt?: null | { not: null };
      };
      data: { readAt?: Date | null; dismissedAt?: Date | null };
    }) => {
      let count = 0;
      for (const notification of this.notifications) {
        if (where.id && notification.id !== where.id) {
          continue;
        }
        if (notification.recipientUserId !== where.recipientUserId) {
          continue;
        }
        if (notification.orgId !== where.orgId) {
          continue;
        }
        if (where.readAt === null && notification.readAt !== null) {
          continue;
        }
        if (where.dismissedAt === null && notification.dismissedAt !== null) {
          continue;
        }
        if (
          where.dismissedAt &&
          'not' in where.dismissedAt &&
          where.dismissedAt.not === null &&
          notification.dismissedAt === null
        ) {
          continue;
        }
        if (data.readAt !== undefined) {
          notification.readAt = data.readAt;
        }
        if (data.dismissedAt !== undefined) {
          notification.dismissedAt = data.dismissedAt;
        }
        count += 1;
      }
      return { count };
    },
  };

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]) {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg(this);
  }

  private hydrateRequest(
    request: RequestRecord,
    include?: {
      unit?: boolean;
      createdByUser?: boolean;
      assignedToUser?: boolean;
      attachments?: boolean;
    },
  ) {
    return {
      ...request,
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
      attachments: include?.attachments ? [] : undefined,
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
    this.residentProfiles = [];
    this.residentInvites = [];
    this.requests = [];
    this.comments = [];
    this.notifications = [];
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

describe('Notifications (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let managerA: UserRecord;
  let buildingAdminA: UserRecord;
  let staffA: UserRecord;
  let residentA: UserRecord;
  let orgUserB: UserRecord;
  let buildingA: BuildingRecord;
  let unitA1: UnitRecord;

  const permissionsByUser = accessPermissionsByUser;

  const listNotifications = async (
    userId: string,
    query = '',
  ): Promise<{ items: NotificationListItem[]; nextCursor?: string }> => {
    const response = await fetch(`${baseUrl}/notifications${query}`, {
      headers: { 'x-user-id': userId },
    });
    expect(response.status).toBe(200);
    return response.json();
  };

  const getUnreadCount = async (
    userId: string,
  ): Promise<{ unreadCount: number }> => {
    const response = await fetch(`${baseUrl}/notifications/unread-count`, {
      headers: { 'x-user-id': userId },
    });
    expect(response.status).toBe(200);
    return response.json();
  };

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [
        ResidentRequestsController,
        BuildingRequestsController,
        NotificationsController,
      ],
      providers: [
        MaintenanceRequestsRepo,
        MaintenanceRequestsService,
        NotificationsRepo,
        NotificationsService,
        NotificationsListener,
        NotificationRecipientResolver,
        {
          provide: NotificationsRealtimeService,
          useValue: {
            publishToUser: () => undefined,
            roomForUser: () => '',
            setServer: () => undefined,
          },
        },
        {
          provide: PushNotificationsService,
          useValue: {
            sendToUsers: async () => undefined,
            registerDevice: async () => undefined,
            unregisterDevice: async () => undefined,
          },
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
        PermissionsGuard,
        OrgScopeGuard,
        BuildingAccessService,
        BuildingAccessGuard,
        {
          provide: BuildingScopeResolverService,
          useValue: {
            resolveForRequest: async () => undefined,
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (userId: string) =>
              permissionsByUser.get(userId) ?? new Set<string>(),
            getUserEffectivePermissionsAcrossAnyScope: async (
              userId: string,
            ) => permissionsByUser.get(userId) ?? new Set<string>(),
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

    unitA1 = await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-101' },
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
    residentA = await prisma.user.create({
      data: {
        email: 'resident@org.test',
        passwordHash: 'hash',
        orgId: orgA.id,
        name: 'Resident A',
        isActive: true,
      },
    });
    orgUserB = await prisma.user.create({
      data: {
        email: 'user@orgb.test',
        passwordHash: 'hash',
        orgId: orgB.id,
        name: 'Org B User',
        isActive: true,
      },
    });

    permissionsByUser.set(
      managerA.id,
      new Set([
        'notifications.read',
        'notifications.write',
        'requests.read',
        'requests.assign',
        'requests.update_status',
        'requests.comment',
      ]),
    );
    permissionsByUser.set(
      buildingAdminA.id,
      new Set([
        'notifications.read',
        'notifications.write',
        'requests.read',
        'requests.assign',
        'requests.update_status',
        'requests.comment',
      ]),
    );
    permissionsByUser.set(
      staffA.id,
      new Set([
        'notifications.read',
        'notifications.write',
        'requests.read',
        'requests.update_status',
        'requests.comment',
      ]),
    );
    permissionsByUser.set(
      residentA.id,
      new Set([
        'resident.requests.create',
        'resident.requests.read',
        'resident.requests.update',
        'resident.requests.cancel',
        'resident.requests.comment',
        'notifications.read',
        'notifications.write',
      ]),
    );
    permissionsByUser.set(
      orgUserB.id,
      new Set(['notifications.read', 'notifications.write']),
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

  it('resident creation notifies manager and building admin', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        title: 'Leaky faucet',
        description: 'Kitchen sink dripping',
      }),
    });

    expect(createResponse.status).toBe(201);

    const managerNotifications = await listNotifications(managerA.id);
    expect(
      managerNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_CREATED,
      ),
    ).toBe(true);

    const adminNotifications = await listNotifications(buildingAdminA.id);
    expect(
      adminNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_CREATED,
      ),
    ).toBe(true);

    const residentNotifications = await listNotifications(residentA.id);
    expect(residentNotifications.items).toHaveLength(0);
  });

  it('assignment notifies staff and resident', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Door jammed' }),
    });
    const created = await createResponse.json();

    const assignResponse = await fetch(
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
    expect(assignResponse.status).toBe(201);

    const staffNotifications = await listNotifications(staffA.id);
    expect(
      staffNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_ASSIGNED,
      ),
    ).toBe(true);

    const residentNotifications = await listNotifications(residentA.id);
    expect(
      residentNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_ASSIGNED,
      ),
    ).toBe(true);
  });

  it('status updates notify resident', async () => {
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

    const statusResponse = await fetch(
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
    expect(statusResponse.status).toBe(201);

    const residentNotifications = await listNotifications(residentA.id);
    expect(
      residentNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_STATUS_CHANGED,
      ),
    ).toBe(true);
  });

  it('resident comment notifies ops and assigned staff', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Hallway light' }),
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

    const commentResponse = await fetch(
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
    expect(commentResponse.status).toBe(201);

    const managerNotifications = await listNotifications(managerA.id);
    expect(
      managerNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_COMMENTED,
      ),
    ).toBe(true);

    const adminNotifications = await listNotifications(buildingAdminA.id);
    expect(
      adminNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_COMMENTED,
      ),
    ).toBe(true);

    const staffNotifications = await listNotifications(staffA.id);
    expect(
      staffNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_COMMENTED,
      ),
    ).toBe(true);

    const residentNotifications = await listNotifications(residentA.id);
    expect(
      residentNotifications.items.some(
        (notification) =>
          notification.type === NotificationTypeEnum.REQUEST_COMMENTED,
      ),
    ).toBe(false);
  });

  it('marking a notification read hides it from unread-only list', async () => {
    await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Noise' }),
    });

    const managerNotifications = await listNotifications(managerA.id);
    const [first] = managerNotifications.items;
    expect(first).toBeTruthy();

    const markResponse = await fetch(
      `${baseUrl}/notifications/${first.id}/read`,
      {
        method: 'POST',
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(markResponse.status).toBe(201);

    const unread = await listNotifications(managerA.id, '?unreadOnly=true');
    expect(unread.items).toHaveLength(0);
  });

  it('mark all read clears unread list', async () => {
    const createResponse = await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Broken window' }),
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

    const markAll = await fetch(`${baseUrl}/notifications/read-all`, {
      method: 'POST',
      headers: { 'x-user-id': managerA.id },
    });
    expect(markAll.status).toBe(201);

    const unread = await listNotifications(managerA.id, '?unreadOnly=true');
    expect(unread.items).toHaveLength(0);
  });

  it('returns the unread count excluding read and dismissed notifications', async () => {
    const first = await prisma.notification.create({
      data: {
        orgId: buildingA.orgId,
        recipientUserId: managerA.id,
        type: NotificationTypeEnum.REQUEST_CREATED,
        title: 'Unread 1',
        body: null,
        data: { requestId: randomUUID() },
      },
    });
    const second = await prisma.notification.create({
      data: {
        orgId: buildingA.orgId,
        recipientUserId: managerA.id,
        type: NotificationTypeEnum.REQUEST_COMMENTED,
        title: 'Unread 2',
        body: null,
        data: { requestId: randomUUID() },
      },
    });

    await expect(getUnreadCount(managerA.id)).resolves.toEqual({
      unreadCount: 2,
    });

    const markReadResponse = await fetch(
      `${baseUrl}/notifications/${first.id}/read`,
      {
        method: 'POST',
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(markReadResponse.status).toBe(201);

    await expect(getUnreadCount(managerA.id)).resolves.toEqual({
      unreadCount: 1,
    });

    const dismissResponse = await fetch(
      `${baseUrl}/notifications/${second.id}/dismiss`,
      {
        method: 'POST',
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(dismissResponse.status).toBe(201);

    await expect(getUnreadCount(managerA.id)).resolves.toEqual({
      unreadCount: 0,
    });
  });

  it('dismiss hides a notification from default list', async () => {
    await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Door lock' }),
    });

    const managerNotifications = await listNotifications(managerA.id);
    const [first] = managerNotifications.items;
    expect(first).toBeTruthy();

    const dismissResponse = await fetch(
      `${baseUrl}/notifications/${first.id}/dismiss`,
      {
        method: 'POST',
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(dismissResponse.status).toBe(201);

    const afterDismiss = await listNotifications(managerA.id);
    expect(afterDismiss.items.some((item) => item.id === first.id)).toBe(false);

    const includeDismissed = await listNotifications(
      managerA.id,
      '?includeDismissed=true',
    );
    const dismissed = includeDismissed.items.find(
      (item) => item.id === first.id,
    );
    expect(dismissed).toBeTruthy();
    expect(dismissed?.dismissedAt).toBeTruthy();

    const undismissResponse = await fetch(
      `${baseUrl}/notifications/${first.id}/undismiss`,
      {
        method: 'POST',
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(undismissResponse.status).toBe(201);

    const afterUndismiss = await listNotifications(managerA.id);
    expect(afterUndismiss.items.some((item) => item.id === first.id)).toBe(
      true,
    );
  });

  it('filters notifications by type', async () => {
    await prisma.notification.create({
      data: {
        orgId: buildingA.orgId,
        recipientUserId: managerA.id,
        type: NotificationTypeEnum.BROADCAST,
        title: 'Broadcast notice',
        body: 'Lift maintenance tonight',
        data: { broadcastId: randomUUID() },
      },
    });
    await prisma.notification.create({
      data: {
        orgId: buildingA.orgId,
        recipientUserId: managerA.id,
        type: NotificationTypeEnum.REQUEST_CREATED,
        title: 'Request created',
        body: null,
        data: { requestId: randomUUID() },
      },
    });

    const filtered = await listNotifications(managerA.id, '?type=BROADCAST');
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.type).toBe(NotificationTypeEnum.BROADCAST);
    expect(filtered.items[0]?.title).toBe('Broadcast notice');
  });

  it('paginates notifications with a stable cursor', async () => {
    const base = new Date('2025-01-01T00:00:00.000Z');
    for (let i = 0; i < 25; i += 1) {
      await prisma.notification.create({
        data: {
          orgId: buildingA.orgId,
          recipientUserId: managerA.id,
          type: NotificationTypeEnum.REQUEST_CREATED,
          title: `n${i}`,
          body: null,
          data: { index: i },
          createdAt: new Date(base.getTime() + i * 1000),
        },
      });
    }

    const page1 = await listNotifications(managerA.id, '?limit=10');
    expect(page1.items).toHaveLength(10);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listNotifications(
      managerA.id,
      `?limit=10&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`,
    );
    expect(page2.items).toHaveLength(10);

    const idsPage1 = new Set(page1.items.map((item) => item.id));
    const overlap = page2.items.some((item) => idsPage1.has(item.id));
    expect(overlap).toBe(false);

    const all = [...page1.items, ...page2.items];
    for (let i = 1; i < all.length; i += 1) {
      const prev = all[i - 1];
      const curr = all[i];
      if (prev.createdAt === curr.createdAt) {
        expect(prev.id >= curr.id).toBe(true);
      } else {
        expect(new Date(prev.createdAt).getTime()).toBeGreaterThan(
          new Date(curr.createdAt).getTime(),
        );
      }
    }
  });

  it('returns 400 for invalid cursor', async () => {
    const response = await fetch(`${baseUrl}/notifications?cursor=not-base64`, {
      headers: { 'x-user-id': managerA.id },
    });
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid notification type filter', async () => {
    const response = await fetch(
      `${baseUrl}/notifications?type=NOT_A_REAL_TYPE`,
      {
        headers: { 'x-user-id': managerA.id },
      },
    );
    expect(response.status).toBe(400);
  });

  it('cross-org users cannot read or mark notifications', async () => {
    await fetch(`${baseUrl}/resident/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({ title: 'Buzzing alarm' }),
    });

    const managerNotifications = await listNotifications(managerA.id);
    const [first] = managerNotifications.items;

    const markResponse = await fetch(
      `${baseUrl}/notifications/${first.id}/read`,
      {
        method: 'POST',
        headers: { 'x-user-id': orgUserB.id },
      },
    );
    expect(markResponse.status).toBe(404);
  });
});

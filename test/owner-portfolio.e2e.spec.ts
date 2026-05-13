import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { OwnerAccessGrantStatus } from '@prisma/client';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OwnerPortfolioGuard } from '../src/common/guards/owner-portfolio.guard';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { OwnerPortfolioController } from '../src/modules/owner-portfolio/owner-portfolio.controller';
import { OwnerPortfolioScopeService } from '../src/modules/owner-portfolio/owner-portfolio-scope.service';
import { UnitOwnershipService } from '../src/modules/unit-ownerships/unit-ownership.service';

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

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
  ownerId: string | null;
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

type MaintenanceRequestRecord = {
  id: string;
  orgId: string;
  buildingId: string;
  unitId: string | null;
  occupancyIdAtCreation?: string | null;
  leaseIdAtCreation?: string | null;
  createdByUserId: string;
  title: string;
  description: string | null;
  status: string;
  type: string | null;
  priority: string | null;
  assignedToUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
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

type MaintenanceRequestAttachmentRecord = {
  id: string;
  requestId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
};

type MaintenanceRequestCommentRecord = {
  id: string;
  requestId: string;
  orgId: string;
  authorUserId: string;
  authorOwnerId: string | null;
  authorType: 'OWNER' | 'TENANT' | 'STAFF' | 'SYSTEM';
  visibility: 'SHARED' | 'INTERNAL';
  message: string;
  createdAt: Date;
};

type OwnerRequestCommentReadStateRecord = {
  id: string;
  userId: string;
  requestId: string;
  lastReadAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private users: UserRecord[] = [];
  private orgs: OrgRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private owners: OwnerRecord[] = [];
  private grants: OwnerAccessGrantRecord[] = [];
  private units: UnitRecord[] = [];
  private ownerships: UnitOwnershipRecord[] = [];
  private occupancies: OccupancyRecord[] = [];
  private leases: LeaseRecord[] = [];
  private residentProfiles: ResidentProfileRecord[] = [];
  private residentInvites: ResidentInviteRecord[] = [];
  private requests: MaintenanceRequestRecord[] = [];
  private attachments: MaintenanceRequestAttachmentRecord[] = [];
  private comments: MaintenanceRequestCommentRecord[] = [];
  private ownerRequestCommentReadStates: OwnerRequestCommentReadStateRecord[] =
    [];

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((user) => user.id === where.id) ?? null;
    },
  };

  occupancy = {
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
        residentUserId?: boolean;
        status?: boolean;
        unitId?: boolean;
        building?: { select: { orgId?: boolean } };
        residentUser?: { select: { name?: boolean } };
      };
      orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
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
          ...(select.residentUserId
            ? { residentUserId: occupancy.residentUserId }
            : {}),
          ...(select.status ? { status: occupancy.status } : {}),
          ...(select.unitId ? { unitId: occupancy.unitId } : {}),
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
        residentUserId?: boolean;
        updatedAt?: boolean;
      };
      orderBy?: Array<{ updatedAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
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
        ...(select.residentUserId
          ? { residentUserId: lease.residentUserId }
          : {}),
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
    findMany: async ({
      where,
      include,
      orderBy,
    }: {
      where: { unitId: { in: string[] } };
      include?: {
        createdByUser?: {
          select: { id: true; name: true; email: true };
        };
        assignedToUser?: {
          select: { id: true; name: true; email: true };
        };
        attachments?: {
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
      orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      let rows = this.requests.filter(
        (request) =>
          request.unitId !== null && where.unitId.in.includes(request.unitId),
      );

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

      return rows.map((row) => {
        const createdByUser = this.users.find(
          (user) => user.id === row.createdByUserId,
        );
        const assignedToUser = row.assignedToUserId
          ? this.users.find((user) => user.id === row.assignedToUserId)
          : null;
        const attachments = this.attachments.filter(
          (attachment) => attachment.requestId === row.id,
        );

        return {
          ...row,
          ...(include?.createdByUser && createdByUser
            ? {
                createdByUser: {
                  id: createdByUser.id,
                  name: createdByUser.name,
                  email: createdByUser.email,
                },
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
      });
    },
    findFirst: async ({
      where,
      include,
    }: {
      where: {
        id: string;
        unitId?: { in: string[] };
      };
      include?: {
        createdByUser?: {
          select: { id: true; name: true; email: true };
        };
        assignedToUser?: {
          select: { id: true; name: true; email: true };
        };
        attachments?: {
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
            (where.unitId?.in
              ? item.unitId !== null && where.unitId.in.includes(item.unitId)
              : true),
        ) ?? null;

      if (!request) {
        return null;
      }

      const createdByUser = this.users.find(
        (user) => user.id === request.createdByUserId,
      );
      const assignedToUser = request.assignedToUserId
        ? this.users.find((user) => user.id === request.assignedToUserId)
        : null;
      const attachments = this.attachments.filter(
        (attachment) => attachment.requestId === request.id,
      );

      return {
        ...request,
        ...(include?.createdByUser && createdByUser
          ? {
              createdByUser: {
                id: createdByUser.id,
                name: createdByUser.name,
                email: createdByUser.email,
              },
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
    },
  };

  maintenanceRequestComment = {
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
      include?: {
        authorUser?: {
          select: { id: true; name: true; email: true };
        };
      };
      orderBy?: { createdAt: 'asc' };
    }) => {
      let rows = this.comments.filter(
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
        rows = rows
          .slice()
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }

      return rows.map((comment) => {
        if (select) {
          return {
            ...(select.requestId ? { requestId: comment.requestId } : {}),
            ...(select.createdAt ? { createdAt: comment.createdAt } : {}),
          };
        }

        const authorUser = this.users.find(
          (user) => user.id === comment.authorUserId,
        );

        return {
          ...comment,
          ...(include?.authorUser && authorUser
            ? {
                authorUser: {
                  id: authorUser.id,
                  name: authorUser.name,
                  email: authorUser.email,
                },
              }
            : {}),
        };
      });
    },
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
      include?: {
        authorUser?: {
          select: { id: true; name: true; email: true };
        };
      };
    }) => {
      const created: MaintenanceRequestCommentRecord = {
        id: randomUUID(),
        requestId: data.request.connect.id,
        orgId: data.org.connect.id,
        authorUserId: data.authorUser.connect.id,
        authorOwnerId: data.authorOwner?.connect.id ?? null,
        authorType: data.authorType,
        visibility: data.visibility,
        message: data.message,
        createdAt: new Date(),
      };
      this.comments.push(created);

      const authorUser = this.users.find(
        (user) => user.id === created.authorUserId,
      );
      return {
        ...created,
        ...(include?.authorUser && authorUser
          ? {
              authorUser: {
                id: authorUser.id,
                name: authorUser.name,
                email: authorUser.email,
              },
            }
          : {}),
      };
    },
  };

  ownerRequestCommentReadState = {
    findMany: async ({
      where,
      select,
    }: {
      where: {
        userId: string;
        requestId: { in: string[] };
      };
      select?: { requestId?: boolean; lastReadAt?: boolean };
    }) => {
      return this.ownerRequestCommentReadStates
        .filter(
          (state) =>
            state.userId === where.userId &&
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
      where: { userId_requestId: { userId: string; requestId: string } };
      update: { lastReadAt: Date };
      create: { userId: string; requestId: string; lastReadAt: Date };
    }) => {
      const existing = this.ownerRequestCommentReadStates.find(
        (state) =>
          state.userId === where.userId_requestId.userId &&
          state.requestId === where.userId_requestId.requestId,
      );
      if (existing) {
        existing.lastReadAt = update.lastReadAt;
        existing.updatedAt = new Date();
        return existing;
      }

      const now = new Date();
      const createdState: OwnerRequestCommentReadStateRecord = {
        id: randomUUID(),
        userId: create.userId,
        requestId: create.requestId,
        lastReadAt: create.lastReadAt,
        createdAt: now,
        updatedAt: now,
      };
      this.ownerRequestCommentReadStates.push(createdState);
      return createdState;
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

  reset() {
    this.users = [];
    this.orgs = [];
    this.buildings = [];
    this.owners = [];
    this.grants = [];
    this.units = [];
    this.ownerships = [];
    this.occupancies = [];
    this.leases = [];
    this.residentProfiles = [];
    this.residentInvites = [];
    this.requests = [];
    this.attachments = [];
    this.comments = [];
    this.ownerRequestCommentReadStates = [];
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

  seedOrg(name: string) {
    const created: OrgRecord = {
      id: randomUUID(),
      name,
    };
    this.orgs.push(created);
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

  setUnitOwner(unitId: string, ownerId: string | null) {
    const unit = this.units.find((item) => item.id === unitId);
    if (!unit) {
      throw new Error('Unit not found');
    }
    unit.ownerId = ownerId;
  }

  listActiveOwnership(unitId: string) {
    return this.ownerships.filter(
      (row) => row.unitId === unitId && row.endDate === null,
    );
  }

  listOwnership(unitId: string) {
    return this.ownerships.filter((row) => row.unitId === unitId);
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
      status: input.status ?? 'OPEN',
      type: input.type ?? null,
      priority: input.priority ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.requests.push(created);
    return created;
  }

  seedRequestAttachment(input: {
    requestId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  }) {
    const created: MaintenanceRequestAttachmentRecord = {
      id: randomUUID(),
      requestId: input.requestId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      url: input.url,
      createdAt: new Date(),
    };
    this.attachments.push(created);
    return created;
  }

  seedRequestComment(input: {
    requestId: string;
    orgId: string;
    authorUserId: string;
    authorOwnerId?: string | null;
    authorType: 'OWNER' | 'TENANT' | 'STAFF' | 'SYSTEM';
    visibility?: 'SHARED' | 'INTERNAL';
    message: string;
  }) {
    const created: MaintenanceRequestCommentRecord = {
      id: randomUUID(),
      requestId: input.requestId,
      orgId: input.orgId,
      authorUserId: input.authorUserId,
      authorOwnerId: input.authorOwnerId ?? null,
      authorType: input.authorType,
      visibility: input.visibility ?? 'SHARED',
      message: input.message,
      createdAt: new Date(),
    };
    this.comments.push(created);
    return created;
  }

  listOwnerRequestCommentReadStates(userId: string) {
    return this.ownerRequestCommentReadStates.filter(
      (state) => state.userId === userId,
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

describe('Owner portfolio (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerUser: UserRecord;
  let unitOwnershipService: UnitOwnershipService;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [OwnerPortfolioController],
      providers: [
        OwnerPortfolioScopeService,
        OwnerPortfolioGuard,
        UnitOwnershipService,
        {
          provide: EventEmitter2,
          useValue: { emit: () => undefined },
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
    unitOwnershipService = moduleRef.get(UnitOwnershipService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.reset();
    ownerUser = prisma.seedUser({
      email: 'owner.user@test.com',
      orgId: null,
    });
  });

  it('returns the union of accessible units across multiple active grants with the required response shape', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const orgB = prisma.seedOrg('Beta Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const buildingB = prisma.seedBuilding({ orgId: orgB.id, name: 'Tower B' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const ownerB = prisma.seedOwner({ orgId: orgB.id, isActive: true });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerB.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    const unitB = prisma.seedUnit({
      buildingId: buildingB.id,
      label: 'B-201',
      ownerId: ownerB.id,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    prisma.seedOwnership({
      orgId: orgB.id,
      unitId: unitB.id,
      ownerId: ownerB.id,
    });

    const unitsResponse = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(unitsResponse.status).toBe(200);
    const unitsBody = await unitsResponse.json();
    expect(unitsBody).toHaveLength(2);
    for (const row of unitsBody) {
      expect(Object.keys(row).sort()).toEqual([
        'buildingId',
        'buildingName',
        'orgId',
        'orgName',
        'ownerId',
        'unitId',
        'unitLabel',
      ]);
    }

    const summaryResponse = await fetch(`${baseUrl}/owner/portfolio/summary`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(summaryResponse.status).toBe(200);
    const summaryBody = await summaryResponse.json();
    expect(summaryBody).toEqual({
      unitCount: 2,
      orgCount: 2,
      buildingCount: 2,
    });
  });

  it('allows access to owner portfolio routes without org scope when an active grant exists', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });

    expect(ownerUser.orgId).toBeNull();

    const response = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        orgId: orgA.id,
        ownerId: ownerA.id,
        unitId: unitA.id,
      }),
    ]);
  });

  it('blocks access when the user has no owner access grant', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });

    const response = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });

    expect(response.status).toBe(403);
  });

  it('lists only requests tied to the current owner scope and returns request detail', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const orgB = prisma.seedOrg('Beta Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const buildingB = prisma.seedBuilding({ orgId: orgB.id, name: 'Tower B' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const ownerB = prisma.seedOwner({ orgId: orgB.id, isActive: true });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      name: 'Resident A',
      orgId: orgA.id,
    });
    const residentB = prisma.seedUser({
      email: 'resident-b@test.com',
      name: 'Resident B',
      orgId: orgB.id,
    });
    const staffA = prisma.seedUser({
      email: 'staff-a@test.com',
      name: 'Staff A',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    const unitB = prisma.seedUnit({
      buildingId: buildingB.id,
      label: 'B-201',
      ownerId: ownerB.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    prisma.seedOwnership({
      orgId: orgB.id,
      unitId: unitB.id,
      ownerId: ownerB.id,
    });
    const visibleRequest = prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Leaky faucet',
      description: 'Kitchen sink dripping',
      status: 'ASSIGNED',
      type: 'PLUMBING_AC_HEATING',
      priority: 'HIGH',
      assignedToUserId: staffA.id,
    });
    prisma.seedRequestAttachment({
      requestId: visibleRequest.id,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
      url: 'https://example.com/photo.jpg',
    });
    const hiddenRequest = prisma.seedRequest({
      orgId: orgB.id,
      buildingId: buildingB.id,
      unitId: unitB.id,
      createdByUserId: residentB.id,
      title: 'Broken light',
    });

    const listResponse = await fetch(`${baseUrl}/owner/portfolio/requests`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toHaveLength(1);
    expect(listBody[0]).toMatchObject({
      id: visibleRequest.id,
      orgId: orgA.id,
      orgName: 'Alpha Org',
      ownerId: ownerA.id,
      buildingId: buildingA.id,
      buildingName: 'Tower A',
      unit: {
        id: unitA.id,
        label: 'A-101',
      },
      createdBy: {
        id: residentA.id,
        name: 'Resident A',
        email: 'resident-a@test.com',
      },
      assignedTo: {
        id: staffA.id,
        name: 'Staff A',
        email: 'staff-a@test.com',
      },
      title: 'Leaky faucet',
      description: 'Kitchen sink dripping',
      status: 'ASSIGNED',
      type: 'PLUMBING_AC_HEATING',
      priority: 'HIGH',
    });
    expect(listBody[0].attachments).toHaveLength(1);

    const detailResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${visibleRequest.id}`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.id).toBe(visibleRequest.id);

    const hiddenDetailResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${hiddenRequest.id}`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(hiddenDetailResponse.status).toBe(404);
  });

  it('allows owners to read shared comments and add a shared comment on an in-scope request', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      name: 'Resident A',
      orgId: orgA.id,
    });
    const staffA = prisma.seedUser({
      email: 'staff-a@test.com',
      name: 'Staff A',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    const request = prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Commentable request',
    });
    prisma.seedRequestComment({
      requestId: request.id,
      orgId: orgA.id,
      authorUserId: residentA.id,
      authorType: 'TENANT',
      visibility: 'SHARED',
      message: 'Please coordinate timing',
    });
    prisma.seedRequestComment({
      requestId: request.id,
      orgId: orgA.id,
      authorUserId: staffA.id,
      authorType: 'STAFF',
      visibility: 'INTERNAL',
      message: 'Internal note only',
    });

    const listResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${request.id}/comments`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toEqual([
      expect.objectContaining({
        requestId: request.id,
        message: 'Please coordinate timing',
        visibility: 'SHARED',
        author: expect.objectContaining({
          id: residentA.id,
          type: 'TENANT',
          ownerId: null,
        }),
      }),
    ]);

    const createResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${request.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': ownerUser.id,
        },
        body: JSON.stringify({ message: 'Approved, please proceed carefully' }),
      },
    );
    expect(createResponse.status).toBe(201);
    const createdBody = await createResponse.json();
    expect(createdBody).toMatchObject({
      requestId: request.id,
      message: 'Approved, please proceed carefully',
      visibility: 'SHARED',
      author: {
        id: ownerUser.id,
        name: null,
        email: 'owner.user@test.com',
        type: 'OWNER',
        ownerId: ownerA.id,
      },
    });

    expect(prisma.listOwnerRequestCommentReadStates(ownerUser.id)).toEqual([
      expect.objectContaining({
        requestId: request.id,
      }),
    ]);
  });

  it('counts unread owner request comments and clears them after the owner opens the request comments', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      name: 'Resident A',
      orgId: orgA.id,
    });
    const staffA = prisma.seedUser({
      email: 'staff-a@test.com',
      name: 'Staff A',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    const request = prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Unread comment request',
    });
    prisma.seedRequestComment({
      requestId: request.id,
      orgId: orgA.id,
      authorUserId: residentA.id,
      authorType: 'TENANT',
      visibility: 'SHARED',
      message: 'Shared update 1',
    });
    prisma.seedRequestComment({
      requestId: request.id,
      orgId: orgA.id,
      authorUserId: staffA.id,
      authorType: 'STAFF',
      visibility: 'SHARED',
      message: 'Shared update 2',
    });
    prisma.seedRequestComment({
      requestId: request.id,
      orgId: orgA.id,
      authorUserId: staffA.id,
      authorType: 'STAFF',
      visibility: 'INTERNAL',
      message: 'Internal note',
    });

    const initialCountResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/comments/unread-count`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(initialCountResponse.status).toBe(200);
    await expect(initialCountResponse.json()).resolves.toEqual({
      unreadCount: 2,
    });

    const listResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${request.id}/comments`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(listResponse.status).toBe(200);

    const afterReadCountResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/comments/unread-count`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(afterReadCountResponse.status).toBe(200);
    await expect(afterReadCountResponse.json()).resolves.toEqual({
      unreadCount: 0,
    });

    prisma.seedRequestComment({
      requestId: request.id,
      orgId: orgA.id,
      authorUserId: residentA.id,
      authorType: 'TENANT',
      visibility: 'SHARED',
      message: 'Shared update 3',
    });

    const afterNewCommentCountResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/comments/unread-count`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(afterNewCommentCountResponse.status).toBe(200);
    await expect(afterNewCommentCountResponse.json()).resolves.toEqual({
      unreadCount: 1,
    });
  });

  it('falls back to Unit.ownerId when active UnitOwnership row is missing', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-404',
      ownerId: ownerA.id,
    });

    const response = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      orgName: 'Alpha Org',
      buildingName: 'Tower A',
      unitLabel: 'A-404',
    });
  });

  it('does not grant access to the same party in another org without a separate active grant', async () => {
    const sharedPartyId = randomUUID();
    const orgA = prisma.seedOrg('Alpha Org');
    const orgB = prisma.seedOrg('Beta Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const buildingB = prisma.seedBuilding({ orgId: orgB.id, name: 'Tower B' });
    const ownerA = prisma.seedOwner({
      orgId: orgA.id,
      partyId: sharedPartyId,
      isActive: true,
    });
    const ownerB = prisma.seedOwner({
      orgId: orgB.id,
      partyId: sharedPartyId,
      isActive: true,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    const unitB = prisma.seedUnit({
      buildingId: buildingB.id,
      label: 'B-201',
      ownerId: ownerB.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    prisma.seedOwnership({
      orgId: orgB.id,
      unitId: unitB.id,
      ownerId: ownerB.id,
    });

    const response = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        orgId: orgA.id,
        orgName: 'Alpha Org',
        ownerId: ownerA.id,
        unitId: unitA.id,
        buildingId: buildingA.id,
        buildingName: 'Tower A',
        unitLabel: 'A-101',
      },
    ]);
  });

  it('blocks access when grant is disabled', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const grant = prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.updateGrantStatus(grant.id, OwnerAccessGrantStatus.DISABLED);

    const response = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(response.status).toBe(403);
  });

  it('blocks request visibility when grant is disabled', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    const grant = prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Leaky faucet',
    });

    prisma.updateGrantStatus(grant.id, OwnerAccessGrantStatus.DISABLED);

    const response = await fetch(`${baseUrl}/owner/portfolio/requests`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(response.status).toBe(403);
  });

  it('blocks owner comment access when grant is disabled or owner is inactive', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    const grant = prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    const request = prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Leaky faucet',
    });

    prisma.updateGrantStatus(grant.id, OwnerAccessGrantStatus.DISABLED);

    const disabledResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${request.id}/comments`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(disabledResponse.status).toBe(403);

    const secondOwnerUser = prisma.seedUser({
      email: 'owner.user.2@test.com',
      orgId: null,
    });
    prisma.seedGrant({
      userId: secondOwnerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.setOwnerActive(ownerA.id, false);

    const inactiveResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${request.id}/comments`,
      {
        headers: { 'x-user-id': secondOwnerUser.id },
      },
    );
    expect(inactiveResponse.status).toBe(403);
  });

  it('blocks access when owner is inactive', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.setOwnerActive(ownerA.id, false);

    const response = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(response.status).toBe(403);
  });

  it('blocks request visibility when owner is inactive', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Leaky faucet',
    });

    prisma.setOwnerActive(ownerA.id, false);

    const response = await fetch(`${baseUrl}/owner/portfolio/requests`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(response.status).toBe(403);
  });

  it('returns empty scope when no active ownership or fallback owner pointer exists', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    const unit = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-999',
      ownerId: null,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unit.id,
      ownerId: ownerA.id,
      endDate: new Date(),
    });

    const response = await fetch(`${baseUrl}/owner/portfolio/units`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('does not leak requests for the same party in another org without a separate active grant', async () => {
    const sharedPartyId = randomUUID();
    const orgA = prisma.seedOrg('Alpha Org');
    const orgB = prisma.seedOrg('Beta Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const buildingB = prisma.seedBuilding({ orgId: orgB.id, name: 'Tower B' });
    const ownerA = prisma.seedOwner({
      orgId: orgA.id,
      partyId: sharedPartyId,
      isActive: true,
    });
    const ownerB = prisma.seedOwner({
      orgId: orgB.id,
      partyId: sharedPartyId,
      isActive: true,
    });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      orgId: orgA.id,
    });
    const residentB = prisma.seedUser({
      email: 'resident-b@test.com',
      orgId: orgB.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    const unitB = prisma.seedUnit({
      buildingId: buildingB.id,
      label: 'B-201',
      ownerId: ownerB.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    prisma.seedOwnership({
      orgId: orgB.id,
      unitId: unitB.id,
      ownerId: ownerB.id,
    });
    const visibleRequest = prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Visible request',
    });
    prisma.seedRequest({
      orgId: orgB.id,
      buildingId: buildingB.id,
      unitId: unitB.id,
      createdByUserId: residentB.id,
      title: 'Hidden request',
    });

    const response = await fetch(`${baseUrl}/owner/portfolio/requests`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: visibleRequest.id,
        orgId: orgA.id,
        ownerId: ownerA.id,
      }),
    ]);
  });

  it('blocks owner comment access outside current scope without a separate cross-org grant', async () => {
    const sharedPartyId = randomUUID();
    const orgA = prisma.seedOrg('Alpha Org');
    const orgB = prisma.seedOrg('Beta Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const buildingB = prisma.seedBuilding({ orgId: orgB.id, name: 'Tower B' });
    const ownerA = prisma.seedOwner({
      orgId: orgA.id,
      partyId: sharedPartyId,
      isActive: true,
    });
    const ownerB = prisma.seedOwner({
      orgId: orgB.id,
      partyId: sharedPartyId,
      isActive: true,
    });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      orgId: orgA.id,
    });
    const residentB = prisma.seedUser({
      email: 'resident-b@test.com',
      orgId: orgB.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    const unitB = prisma.seedUnit({
      buildingId: buildingB.id,
      label: 'B-201',
      ownerId: ownerB.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    prisma.seedOwnership({
      orgId: orgB.id,
      unitId: unitB.id,
      ownerId: ownerB.id,
    });
    const hiddenRequest = prisma.seedRequest({
      orgId: orgB.id,
      buildingId: buildingB.id,
      unitId: unitB.id,
      createdByUserId: residentB.id,
      title: 'Hidden request',
    });
    prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Visible request',
    });

    const response = await fetch(
      `${baseUrl}/owner/portfolio/requests/${hiddenRequest.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': ownerUser.id,
        },
        body: JSON.stringify({ message: 'Should not be allowed' }),
      },
    );
    expect(response.status).toBe(404);
  });

  it('updates request visibility according to current ownership only after reassignment', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const ownerB = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const secondOwnerUser = prisma.seedUser({
      email: 'owner.user.2@test.com',
      orgId: null,
    });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedGrant({
      userId: secondOwnerUser.id,
      ownerId: ownerB.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    const request = prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Ownership change request',
    });

    const beforeResponse = await fetch(`${baseUrl}/owner/portfolio/requests`, {
      headers: { 'x-user-id': ownerUser.id },
    });
    expect(beforeResponse.status).toBe(200);
    await expect(beforeResponse.json()).resolves.toEqual([
      expect.objectContaining({ id: request.id, ownerId: ownerA.id }),
    ]);

    prisma.setUnitOwner(unitA.id, ownerB.id);
    await unitOwnershipService.syncCurrentOwner({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerB.id,
    });

    const afterOldOwnerResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(afterOldOwnerResponse.status).toBe(200);
    await expect(afterOldOwnerResponse.json()).resolves.toEqual([]);

    const afterNewOwnerResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests`,
      {
        headers: { 'x-user-id': secondOwnerUser.id },
      },
    );
    expect(afterNewOwnerResponse.status).toBe(200);
    await expect(afterNewOwnerResponse.json()).resolves.toEqual([
      expect.objectContaining({ id: request.id, ownerId: ownerB.id }),
    ]);
  });

  it('revokes owner comment access immediately after ownership reassignment', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const ownerB = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const secondOwnerUser = prisma.seedUser({
      email: 'owner.user.2@test.com',
      orgId: null,
    });
    const residentA = prisma.seedUser({
      email: 'resident-a@test.com',
      orgId: orgA.id,
    });
    const unitA = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-101',
      ownerId: ownerA.id,
    });
    prisma.seedGrant({
      userId: ownerUser.id,
      ownerId: ownerA.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedGrant({
      userId: secondOwnerUser.id,
      ownerId: ownerB.id,
      status: OwnerAccessGrantStatus.ACTIVE,
    });
    prisma.seedOwnership({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerA.id,
    });
    const request = prisma.seedRequest({
      orgId: orgA.id,
      buildingId: buildingA.id,
      unitId: unitA.id,
      createdByUserId: residentA.id,
      title: 'Ownership change request',
    });

    prisma.setUnitOwner(unitA.id, ownerB.id);
    await unitOwnershipService.syncCurrentOwner({
      orgId: orgA.id,
      unitId: unitA.id,
      ownerId: ownerB.id,
    });

    const oldOwnerResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${request.id}/comments`,
      {
        headers: { 'x-user-id': ownerUser.id },
      },
    );
    expect(oldOwnerResponse.status).toBe(404);

    const newOwnerResponse = await fetch(
      `${baseUrl}/owner/portfolio/requests/${request.id}/comments`,
      {
        headers: { 'x-user-id': secondOwnerUser.id },
      },
    );
    expect(newOwnerResponse.status).toBe(200);
  });

  it('maintains owner pointer and ownership history consistency under dual-write operations', async () => {
    const orgA = prisma.seedOrg('Alpha Org');
    const buildingA = prisma.seedBuilding({ orgId: orgA.id, name: 'Tower A' });
    const ownerA = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const ownerB = prisma.seedOwner({ orgId: orgA.id, isActive: true });
    const unit = prisma.seedUnit({
      buildingId: buildingA.id,
      label: 'A-707',
      ownerId: null,
    });

    prisma.setUnitOwner(unit.id, ownerA.id);
    await unitOwnershipService.syncCurrentOwner({
      orgId: orgA.id,
      unitId: unit.id,
      ownerId: ownerA.id,
    });
    expect(prisma.listActiveOwnership(unit.id)).toHaveLength(1);
    expect(prisma.listActiveOwnership(unit.id)[0].ownerId).toBe(ownerA.id);

    prisma.setUnitOwner(unit.id, ownerA.id);
    await unitOwnershipService.syncCurrentOwner({
      orgId: orgA.id,
      unitId: unit.id,
      ownerId: ownerA.id,
    });
    expect(prisma.listActiveOwnership(unit.id)).toHaveLength(1);

    prisma.setUnitOwner(unit.id, ownerB.id);
    await unitOwnershipService.syncCurrentOwner({
      orgId: orgA.id,
      unitId: unit.id,
      ownerId: ownerB.id,
    });
    expect(prisma.listActiveOwnership(unit.id)).toHaveLength(1);
    expect(prisma.listActiveOwnership(unit.id)[0].ownerId).toBe(ownerB.id);
    const endedRows = prisma
      .listOwnership(unit.id)
      .filter((row) => row.ownerId === ownerA.id && row.endDate !== null);
    expect(endedRows.length).toBeGreaterThan(0);

    prisma.setUnitOwner(unit.id, null);
    await unitOwnershipService.syncCurrentOwner({
      orgId: orgA.id,
      unitId: unit.id,
      ownerId: null,
    });
    expect(prisma.listActiveOwnership(unit.id)).toHaveLength(0);
  });
});

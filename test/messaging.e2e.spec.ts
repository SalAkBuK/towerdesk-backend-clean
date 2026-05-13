import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { BuildingScopeResolverService } from '../src/common/building-access/building-scope-resolver.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BuildingAccessService } from '../src/common/building-access/building-access.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { OwnerPortfolioGuard } from '../src/common/guards/owner-portfolio.guard';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { MessagingController } from '../src/modules/messaging/messaging.controller';
import { OwnerMessagingController } from '../src/modules/messaging/owner-messaging.controller';
import { ResidentMessagingController } from '../src/modules/messaging/resident-messaging.controller';
import { MessagingService } from '../src/modules/messaging/messaging.service';
import { MessagingRepo } from '../src/modules/messaging/messaging.repo';
import { NotificationsRealtimeService } from '../src/modules/notifications/notifications-realtime.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { OwnerPortfolioScopeService } from '../src/modules/owner-portfolio/owner-portfolio-scope.service';

type OrgRecord = {
  id: string;
  name: string;
};

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
  name?: string | null;
  avatarUrl?: string | null;
};

type BuildingRecord = {
  id: string;
  orgId: string;
  name: string;
};

type UnitRecord = {
  id: string;
  buildingId: string;
  label: string;
  ownerId?: string | null;
};

type OwnerRecord = {
  id: string;
  orgId: string;
  isActive: boolean;
};

type OwnerAccessGrantRecord = {
  id: string;
  ownerId: string;
  userId: string | null;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
};

type UnitOwnershipRecord = {
  id: string;
  orgId: string;
  unitId: string;
  ownerId: string;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
};

type BuildingAssignmentRecord = {
  id: string;
  buildingId: string;
  userId: string;
  type: 'MANAGER' | 'STAFF' | 'BUILDING_ADMIN';
};

type OccupancyRecord = {
  id: string;
  buildingId: string;
  unitId: string;
  residentUserId: string;
  status: 'ACTIVE' | 'ENDED';
};

type ConversationRecord = {
  id: string;
  orgId: string;
  buildingId?: string | null;
  type:
    | 'MANAGEMENT_INTERNAL'
    | 'MANAGEMENT_TENANT'
    | 'MANAGEMENT_OWNER'
    | 'OWNER_TENANT';
  counterpartyGroup: 'STAFF' | 'TENANT' | 'OWNER' | 'MIXED';
  subject?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ConversationParticipantRecord = {
  conversationId: string;
  userId: string;
  lastReadAt: Date | null;
};

type MessageRecord = {
  id: string;
  conversationId: string;
  senderUserId: string;
  content: string;
  createdAt: Date;
};

type PrismaConversationInclude = {
  org?: { select?: Record<string, boolean> };
  building?: { select?: Record<string, boolean> };
  participants?: {
    include?: { user?: { select?: Record<string, boolean> } };
  };
  messages?: {
    orderBy?: { createdAt: 'asc' | 'desc' };
    take?: number;
    include?: { senderUser?: { select?: Record<string, boolean> } };
  };
};

let prisma: InMemoryPrismaService;
const ownerAccessByUser = new Map<string, boolean>();
const orgScopedMessagingUsersByOrg = new Map<string, Set<string>>();
const accessibleOwnerUnitsByUser = new Map<
  string,
  Array<{
    orgId: string;
    orgName: string;
    ownerId: string;
    unitId: string;
    buildingId: string;
    buildingName: string;
    unitLabel: string;
  }>
>();

class InMemoryPrismaService {
  private orgs: OrgRecord[] = [];
  private users: UserRecord[] = [];
  private buildings: BuildingRecord[] = [];
  private units: UnitRecord[] = [];
  private owners: OwnerRecord[] = [];
  private ownerAccessGrants: OwnerAccessGrantRecord[] = [];
  private unitOwnerships: UnitOwnershipRecord[] = [];
  private assignments: BuildingAssignmentRecord[] = [];
  private occupancies: OccupancyRecord[] = [];
  private conversations: ConversationRecord[] = [];
  private conversationParticipants: ConversationParticipantRecord[] = [];
  private messages: MessageRecord[] = [];

  org = {
    create: async ({ data }: { data: { name: string } }) => {
      const org: OrgRecord = { id: randomUUID(), name: data.name };
      this.orgs.push(org);
      return org;
    },
  };

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((user) => user.id === where.id) ?? null;
    },
    findMany: async ({
      where,
    }: {
      where?: {
        id?: { in: string[] };
        orgId?: string;
        isActive?: boolean;
      };
    }) => {
      return this.users.filter((user) => {
        if (where?.id?.in && !where.id.in.includes(user.id)) {
          return false;
        }
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
        orgId: string | null;
        isActive: boolean;
        name?: string | null;
        avatarUrl?: string | null;
      };
    }) => {
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        orgId: data.orgId,
        isActive: data.isActive,
        name: data.name ?? null,
        avatarUrl: data.avatarUrl ?? null,
      };
      this.users.push(user);
      return user;
    },
  };

  building = {
    create: async ({ data }: { data: { orgId: string; name: string } }) => {
      const building: BuildingRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        name: data.name,
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
      data: { buildingId: string; label: string; ownerId?: string | null };
    }) => {
      const unit: UnitRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        label: data.label,
        ownerId: data.ownerId ?? null,
      };
      this.units.push(unit);
      return unit;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where: {
        id: string;
        building?: { orgId: string };
        ownerId?: { not: null };
        ownerships?: { none: { endDate: null } };
        owner?: {
          isActive?: boolean;
          accessGrants?: {
            some?: {
              status?: 'ACTIVE' | 'PENDING' | 'DISABLED';
              userId?: { not: null };
            };
          };
        };
      };
      select?: { ownerId?: boolean };
    }) => {
      const unit =
        this.units.find((candidate) => {
          if (candidate.id !== where.id) {
            return false;
          }
          if (where.building?.orgId) {
            const building = this.buildings.find(
              (record) => record.id === candidate.buildingId,
            );
            if (!building || building.orgId !== where.building.orgId) {
              return false;
            }
          }
          if (where.ownerId?.not === null && candidate.ownerId === null) {
            return false;
          }
          if (where.ownerships?.none?.endDate === null) {
            const hasActiveOwnership = this.unitOwnerships.some(
              (ownership) =>
                ownership.unitId === candidate.id && ownership.endDate === null,
            );
            if (hasActiveOwnership) {
              return false;
            }
          }
          if (where.owner) {
            if (!candidate.ownerId) {
              return false;
            }
            const owner = this.owners.find(
              (record) => record.id === candidate.ownerId,
            );
            if (!owner) {
              return false;
            }
            if (
              where.owner.isActive !== undefined &&
              owner.isActive !== where.owner.isActive
            ) {
              return false;
            }
            const grantFilter = where.owner.accessGrants?.some;
            if (grantFilter) {
              const hasGrant = this.ownerAccessGrants.some((grant) => {
                if (grant.ownerId !== owner.id) {
                  return false;
                }
                if (
                  grantFilter.status !== undefined &&
                  grant.status !== grantFilter.status
                ) {
                  return false;
                }
                if (grantFilter.userId?.not === null && grant.userId === null) {
                  return false;
                }
                return true;
              });
              if (!hasGrant) {
                return false;
              }
            }
          }
          return true;
        }) ?? null;

      if (!unit) {
        return null;
      }

      if (select?.ownerId) {
        return { ownerId: unit.ownerId ?? null };
      }

      return unit;
    },
  };

  owner = {
    create: async ({
      data,
    }: {
      data: { orgId: string; isActive: boolean };
    }) => {
      const owner: OwnerRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        isActive: data.isActive,
      };
      this.owners.push(owner);
      return owner;
    },
  };

  ownerAccessGrant = {
    findMany: async ({
      where,
      select,
    }: {
      where: {
        ownerId?: string | { in: string[] };
        status?: 'PENDING' | 'ACTIVE' | 'DISABLED';
        userId?: { not: null } | { in: string[] };
        owner?: { isActive?: boolean; orgId?: string };
      };
      select?: { userId?: boolean };
    }) => {
      return this.ownerAccessGrants
        .filter((grant) => {
          if (
            typeof where.ownerId === 'string' &&
            grant.ownerId !== where.ownerId
          ) {
            return false;
          }
          if (
            typeof where.ownerId === 'object' &&
            'in' in where.ownerId &&
            !where.ownerId.in.includes(grant.ownerId)
          ) {
            return false;
          }
          if (where.status && grant.status !== where.status) {
            return false;
          }
          if (where.userId) {
            if (
              'not' in where.userId &&
              where.userId.not === null &&
              grant.userId === null
            ) {
              return false;
            }
            if (
              'in' in where.userId &&
              (!grant.userId || !where.userId.in.includes(grant.userId))
            ) {
              return false;
            }
          }
          if (where.owner?.isActive !== undefined || where.owner?.orgId) {
            const owner = this.owners.find(
              (record) => record.id === grant.ownerId,
            );
            if (!owner) {
              return false;
            }
            if (
              where.owner.isActive !== undefined &&
              owner.isActive !== where.owner.isActive
            ) {
              return false;
            }
            if (where.owner.orgId && owner.orgId !== where.owner.orgId) {
              return false;
            }
          }
          return true;
        })
        .map((grant) => (select?.userId ? { userId: grant.userId } : grant));
    },
    create: async ({
      data,
    }: {
      data: {
        ownerId: string;
        userId: string | null;
        status: 'PENDING' | 'ACTIVE' | 'DISABLED';
      };
    }) => {
      const grant: OwnerAccessGrantRecord = {
        id: randomUUID(),
        ownerId: data.ownerId,
        userId: data.userId,
        status: data.status,
      };
      this.ownerAccessGrants.push(grant);
      return grant;
    },
  };

  unitOwnership = {
    findFirst: async ({
      where,
      orderBy,
      select,
    }: {
      where: {
        orgId: string;
        unitId: string;
        endDate: null;
        owner?: {
          isActive?: boolean;
          accessGrants?: {
            some?: {
              status?: 'PENDING' | 'ACTIVE' | 'DISABLED';
              userId?: { not: null };
            };
          };
        };
      };
      orderBy?: Array<{
        startDate?: 'asc' | 'desc';
        createdAt?: 'asc' | 'desc';
      }>;
      select?: { ownerId?: boolean };
    }) => {
      let ownerships = this.unitOwnerships.filter((ownership) => {
        if (ownership.orgId !== where.orgId) {
          return false;
        }
        if (ownership.unitId !== where.unitId) {
          return false;
        }
        if (ownership.endDate !== where.endDate) {
          return false;
        }
        if (where.owner) {
          const owner = this.owners.find(
            (record) => record.id === ownership.ownerId,
          );
          if (!owner) {
            return false;
          }
          if (
            where.owner.isActive !== undefined &&
            owner.isActive !== where.owner.isActive
          ) {
            return false;
          }
          const grantFilter = where.owner.accessGrants?.some;
          if (grantFilter) {
            const hasGrant = this.ownerAccessGrants.some((grant) => {
              if (grant.ownerId !== owner.id) {
                return false;
              }
              if (
                grantFilter.status !== undefined &&
                grant.status !== grantFilter.status
              ) {
                return false;
              }
              if (grantFilter.userId?.not === null && grant.userId === null) {
                return false;
              }
              return true;
            });
            if (!hasGrant) {
              return false;
            }
          }
        }
        return true;
      });

      if (orderBy?.length) {
        ownerships = ownerships.sort((a, b) => {
          if (a.startDate.getTime() !== b.startDate.getTime()) {
            return b.startDate.getTime() - a.startDate.getTime();
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
      }

      const ownership = ownerships[0] ?? null;
      if (!ownership) {
        return null;
      }

      if (select?.ownerId) {
        return { ownerId: ownership.ownerId };
      }

      return ownership;
    },
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        unitId: string;
        ownerId: string;
        startDate: Date;
        endDate?: Date | null;
      };
    }) => {
      const ownership: UnitOwnershipRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        unitId: data.unitId,
        ownerId: data.ownerId,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        createdAt: new Date(),
      };
      this.unitOwnerships.push(ownership);
      return ownership;
    },
  };

  buildingAssignment = {
    findMany: async ({
      where,
      select,
    }: {
      where: {
        buildingId?: string;
        userId?: string;
        building?: { orgId: string };
        type?: { in: string[] };
        user?: { isActive: boolean };
      };
      select?: { buildingId?: boolean; userId?: boolean };
    }) => {
      return this.assignments
        .filter((assignment) => {
          if (where.buildingId && assignment.buildingId !== where.buildingId) {
            return false;
          }
          if (where.userId && assignment.userId !== where.userId) {
            return false;
          }
          if (
            where.building?.orgId &&
            this.buildings.find((b) => b.id === assignment.buildingId)
              ?.orgId !== where.building.orgId
          ) {
            return false;
          }
          if (where.type?.in && !where.type.in.includes(assignment.type)) {
            return false;
          }
          if (where.user?.isActive !== undefined) {
            const user = this.users.find((u) => u.id === assignment.userId);
            if (!user || user.isActive !== where.user.isActive) {
              return false;
            }
          }
          return true;
        })
        .map((assignment) =>
          select?.userId
            ? { userId: assignment.userId }
            : select?.buildingId
              ? { buildingId: assignment.buildingId }
              : assignment,
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
      const assignment: BuildingAssignmentRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        userId: data.userId,
        type: data.type,
      };
      this.assignments.push(assignment);
      return assignment;
    },
  };

  userAccessAssignment = {
    findMany: async ({
      where,
      select,
    }: {
      where: {
        userId?: string | { in: string[] };
        scopeType?: 'BUILDING' | 'ORG';
        scopeId?: string | null;
        roleTemplate?: {
          orgId?: string;
          scopeType?: 'BUILDING' | 'ORG';
          rolePermissions?: {
            some?: { permission?: { key?: string } };
          };
        };
        user?: { isActive?: boolean; orgId?: string };
      };
      select?: { userId?: boolean; scopeId?: boolean };
      distinct?: string[];
    }) => {
      const matchesUserId = (candidateUserId: string) => {
        if (!where.userId) {
          return true;
        }
        if (typeof where.userId === 'string') {
          return candidateUserId === where.userId;
        }
        return where.userId.in.includes(candidateUserId);
      };

      const assignments = this.assignments.filter((assignment) => {
        if (where.scopeType && where.scopeType !== 'BUILDING') {
          return false;
        }
        if (!matchesUserId(assignment.userId)) {
          return false;
        }
        if (where.scopeId && assignment.buildingId !== where.scopeId) {
          return false;
        }
        if (where.roleTemplate?.orgId) {
          const building = this.buildings.find(
            (b) => b.id === assignment.buildingId,
          );
          if (!building || building.orgId !== where.roleTemplate.orgId) {
            return false;
          }
        }
        if (
          where.roleTemplate?.rolePermissions?.some?.permission?.key ===
          'messaging.write'
        ) {
          return ['MANAGER', 'STAFF', 'BUILDING_ADMIN'].includes(
            assignment.type,
          );
        }
        if (where.user?.isActive !== undefined || where.user?.orgId) {
          const user = this.users.find(
            (record) => record.id === assignment.userId,
          );
          if (!user) {
            return false;
          }
          if (
            where.user.isActive !== undefined &&
            user.isActive !== where.user.isActive
          ) {
            return false;
          }
          if (where.user.orgId && user.orgId !== where.user.orgId) {
            return false;
          }
        }
        return true;
      });

      const mappedAssignments = assignments.map((assignment) => {
        if (select?.userId) {
          return { userId: assignment.userId };
        }
        if (select?.scopeId) {
          return { scopeId: assignment.buildingId };
        }
        return assignment;
      });

      const orgScopedMessagingUserIds = where.roleTemplate?.orgId
        ? Array.from(
            orgScopedMessagingUsersByOrg.get(where.roleTemplate.orgId) ?? [],
          ).filter(matchesUserId)
        : [];

      if (
        where.roleTemplate?.rolePermissions?.some?.permission?.key !==
          'messaging.write' ||
        orgScopedMessagingUserIds.length === 0
      ) {
        return mappedAssignments;
      }

      return [
        ...mappedAssignments,
        ...orgScopedMessagingUserIds.map((userId) =>
          select?.userId
            ? { userId }
            : select?.scopeId
              ? { scopeId: null }
              : {
                  userId,
                  scopeId: null,
                  scopeType: 'ORG' as const,
                },
        ),
      ];
    },
  };

  occupancy = {
    findFirst: async ({
      where,
      select,
    }: {
      where: {
        residentUserId: string;
        unitId?: string;
        status?: 'ACTIVE' | 'ENDED';
        building?: { orgId: string };
        residentUser?: { isActive: boolean };
      };
      select?: { id?: boolean; buildingId?: boolean; unitId?: boolean };
    }) => {
      const occupancy =
        this.occupancies.find((occ) => {
          if (occ.residentUserId !== where.residentUserId) {
            return false;
          }
          if (where.unitId && occ.unitId !== where.unitId) {
            return false;
          }
          if (where.status && occ.status !== where.status) {
            return false;
          }
          if (where.building?.orgId) {
            const building = this.buildings.find(
              (b) => b.id === occ.buildingId,
            );
            if (!building || building.orgId !== where.building.orgId) {
              return false;
            }
          }
          if (where.residentUser?.isActive !== undefined) {
            const resident = this.users.find(
              (u) => u.id === occ.residentUserId,
            );
            if (
              !resident ||
              resident.isActive !== where.residentUser.isActive
            ) {
              return false;
            }
          }
          return true;
        }) ?? null;

      if (!occupancy) {
        return null;
      }

      if (select?.id || select?.buildingId) {
        return {
          ...(select?.id ? { id: occupancy.id } : {}),
          ...(select?.buildingId ? { buildingId: occupancy.buildingId } : {}),
          ...(select?.unitId ? { unitId: occupancy.unitId } : {}),
        };
      }

      return occupancy;
    },
    findMany: async ({
      where,
    }: {
      where: {
        buildingId?: string;
        residentUserId?: { in: string[] };
        building?: { orgId: string };
        status: 'ACTIVE' | 'ENDED';
        residentUser?: { isActive: boolean };
      };
      select?: { residentUserId?: boolean };
      distinct?: string[];
    }) => {
      const filtered = this.occupancies.filter((occ) => {
        if (where.buildingId && occ.buildingId !== where.buildingId) {
          return false;
        }
        if (
          where.residentUserId &&
          !where.residentUserId.in.includes(occ.residentUserId)
        ) {
          return false;
        }
        if (occ.status !== where.status) {
          return false;
        }
        if (where.building?.orgId) {
          const building = this.buildings.find((b) => b.id === occ.buildingId);
          if (!building || building.orgId !== where.building.orgId) {
            return false;
          }
        }
        if (where.residentUser?.isActive !== undefined) {
          const user = this.users.find((u) => u.id === occ.residentUserId);
          if (!user || user.isActive !== where.residentUser.isActive) {
            return false;
          }
        }
        return true;
      });
      const unique = new Map<string, OccupancyRecord>();
      for (const occ of filtered) {
        unique.set(occ.residentUserId, occ);
      }
      return Array.from(unique.values());
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
      const record: OccupancyRecord = {
        id: randomUUID(),
        buildingId: data.buildingId,
        unitId: data.unitId,
        residentUserId: data.residentUserId,
        status: data.status,
      };
      this.occupancies.push(record);
      return record;
    },
  };

  conversation = {
    create: async ({
      data,
      include,
    }: {
      data: {
        orgId: string;
        buildingId?: string | null;
        type:
          | 'MANAGEMENT_INTERNAL'
          | 'MANAGEMENT_TENANT'
          | 'MANAGEMENT_OWNER'
          | 'OWNER_TENANT';
        counterpartyGroup: 'STAFF' | 'TENANT' | 'OWNER' | 'MIXED';
        subject?: string | null;
        participants: {
          create: { userId: string; lastReadAt: Date | null }[];
        };
        messages: { create: { senderUserId: string; content: string } };
      };
      include?: PrismaConversationInclude;
    }) => {
      const now = new Date();
      const conversation: ConversationRecord = {
        id: randomUUID(),
        orgId: data.orgId,
        buildingId: data.buildingId ?? null,
        type: data.type,
        counterpartyGroup: data.counterpartyGroup,
        subject: data.subject ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.conversations.push(conversation);

      for (const participant of data.participants.create) {
        this.conversationParticipants.push({
          conversationId: conversation.id,
          userId: participant.userId,
          lastReadAt: participant.lastReadAt,
        });
      }

      const message: MessageRecord = {
        id: randomUUID(),
        conversationId: conversation.id,
        senderUserId: data.messages.create.senderUserId,
        content: data.messages.create.content,
        createdAt: now,
      };
      this.messages.push(message);

      return this.hydrateConversation(conversation, include);
    },
    findFirst: async ({
      where,
      include,
    }: {
      where: {
        id: string;
        orgId?: string;
        participants?: { some: { userId: string } };
      };
      include?: PrismaConversationInclude;
    }) => {
      const conversation = this.conversations.find(
        (conv) =>
          conv.id === where.id &&
          (where.orgId ? conv.orgId === where.orgId : true) &&
          (where.participants?.some
            ? this.conversationParticipants.some(
                (participant) =>
                  participant.conversationId === conv.id &&
                  participant.userId === where.participants?.some.userId,
              )
            : true),
      );
      if (!conversation) {
        return null;
      }
      return this.hydrateConversation(conversation, include);
    },
    findMany: async ({
      where,
      orderBy,
      take,
      include,
    }: {
      where: {
        orgId?: string;
        type?:
          | 'MANAGEMENT_INTERNAL'
          | 'MANAGEMENT_TENANT'
          | 'MANAGEMENT_OWNER'
          | 'OWNER_TENANT';
        counterpartyGroup?: 'STAFF' | 'TENANT' | 'OWNER' | 'MIXED';
        participants: { some: { userId: string } };
        OR?: (
          | { updatedAt: { lt: Date } }
          | { updatedAt: Date; id: { lt: string } }
        )[];
      };
      orderBy?: Array<{ updatedAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
      take?: number;
      include?: PrismaConversationInclude;
    }) => {
      let cursorDate: Date | null = null;
      let cursorId: string | null = null;
      if (where.OR) {
        for (const clause of where.OR) {
          const updatedAtValue = (clause as { updatedAt?: unknown }).updatedAt;
          if (
            updatedAtValue &&
            typeof updatedAtValue === 'object' &&
            'lt' in updatedAtValue
          ) {
            cursorDate = (updatedAtValue as { lt: Date }).lt;
          } else if (updatedAtValue instanceof Date) {
            cursorDate = updatedAtValue;
            cursorId = (clause as { id?: { lt: string } }).id?.lt ?? null;
          }
        }
      }

      let results = this.conversations.filter((conversation) => {
        if (where.orgId && conversation.orgId !== where.orgId) {
          return false;
        }
        if (where.type && conversation.type !== where.type) {
          return false;
        }
        if (
          where.counterpartyGroup &&
          conversation.counterpartyGroup !== where.counterpartyGroup
        ) {
          return false;
        }
        const isParticipant = this.conversationParticipants.some(
          (participant) =>
            participant.conversationId === conversation.id &&
            participant.userId === where.participants.some.userId,
        );
        if (!isParticipant) {
          return false;
        }
        if (cursorDate) {
          if (conversation.updatedAt < cursorDate) {
            return true;
          }
          if (
            cursorId &&
            conversation.updatedAt.getTime() === cursorDate.getTime() &&
            conversation.id < cursorId
          ) {
            return true;
          }
          return false;
        }
        return true;
      });

      if (orderBy && orderBy.length > 0) {
        results = results.sort((a, b) => {
          if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
            return b.updatedAt.getTime() - a.updatedAt.getTime();
          }
          return b.id.localeCompare(a.id);
        });
      }

      if (take !== undefined) {
        results = results.slice(0, take);
      }

      return results.map((conversation) =>
        this.hydrateConversation(conversation, include),
      );
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { updatedAt: Date };
    }) => {
      const conversation = this.conversations.find(
        (conv) => conv.id === where.id,
      );
      if (conversation) {
        conversation.updatedAt = data.updatedAt;
      }
      return conversation ?? null;
    },
  };

  conversationParticipant = {
    updateMany: async ({
      where,
      data,
    }: {
      where: { conversationId: string; userId: string };
      data: { lastReadAt: Date | null };
    }) => {
      let count = 0;
      for (const participant of this.conversationParticipants) {
        if (
          participant.conversationId === where.conversationId &&
          participant.userId === where.userId
        ) {
          participant.lastReadAt = data.lastReadAt;
          count += 1;
        }
      }
      return { count };
    },
    findUnique: async ({
      where,
    }: {
      where: {
        conversationId_userId: { conversationId: string; userId: string };
      };
    }) => {
      return (
        this.conversationParticipants.find(
          (participant) =>
            participant.conversationId ===
              where.conversationId_userId.conversationId &&
            participant.userId === where.conversationId_userId.userId,
        ) ?? null
      );
    },
    findMany: async ({
      where,
      select,
    }: {
      where: { conversationId: string };
      select?: { userId?: boolean };
    }) => {
      return this.conversationParticipants
        .filter(
          (participant) => participant.conversationId === where.conversationId,
        )
        .map((participant) =>
          select?.userId ? { userId: participant.userId } : participant,
        );
    },
  };

  hasBuildingAssignment(userId: string, buildingId: string) {
    return this.assignments.some(
      (assignment) =>
        assignment.userId === userId && assignment.buildingId === buildingId,
    );
  }

  message = {
    create: async ({
      data,
      include,
    }: {
      data: { conversationId: string; senderUserId: string; content: string };
      include?: { senderUser?: { select?: Record<string, boolean> } };
    }) => {
      const message: MessageRecord = {
        id: randomUUID(),
        conversationId: data.conversationId,
        senderUserId: data.senderUserId,
        content: data.content,
        createdAt: new Date(),
      };
      this.messages.push(message);
      return this.hydrateMessage(message, include);
    },
  };

  reset() {
    this.orgs = [];
    this.users = [];
    this.buildings = [];
    this.units = [];
    this.owners = [];
    this.ownerAccessGrants = [];
    this.unitOwnerships = [];
    this.assignments = [];
    this.occupancies = [];
    this.conversations = [];
    this.conversationParticipants = [];
    this.messages = [];
  }

  private hydrateConversation(
    conversation: ConversationRecord,
    include?: PrismaConversationInclude,
  ) {
    const participants = this.conversationParticipants.filter(
      (participant) => participant.conversationId === conversation.id,
    );
    const messages = this.messages.filter(
      (message) => message.conversationId === conversation.id,
    );

    const orderedMessages = include?.messages?.orderBy?.createdAt
      ? [...messages].sort((a, b) =>
          include.messages?.orderBy?.createdAt === 'asc'
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime(),
        )
      : [...messages];

    const limitedMessages =
      include?.messages?.take !== undefined
        ? orderedMessages.slice(0, include.messages.take)
        : orderedMessages;

    return {
      ...conversation,
      ...(include?.org
        ? {
            org: this.orgs.find((org) => org.id === conversation.orgId),
          }
        : {}),
      ...(include?.building
        ? {
            building: conversation.buildingId
              ? (this.buildings.find(
                  (building) => building.id === conversation.buildingId,
                ) ?? null)
              : null,
          }
        : {}),
      participants: include?.participants
        ? participants.map((participant) => ({
            ...participant,
            user: this.users.find((user) => user.id === participant.userId),
          }))
        : participants,
      messages: include?.messages
        ? limitedMessages.map((message) =>
            this.hydrateMessage(message, include.messages?.include),
          )
        : limitedMessages,
    };
  }

  private hydrateMessage(
    message: MessageRecord,
    include?: { senderUser?: { select?: Record<string, boolean> } },
  ) {
    return {
      ...message,
      senderUser: include?.senderUser
        ? this.users.find((user) => user.id === message.senderUserId)
        : undefined,
    };
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
class TestOwnerPortfolioScopeService {
  async hasActiveOwnerAccess(userId: string) {
    return ownerAccessByUser.get(userId) ?? false;
  }

  async listAccessibleUnits(userId: string) {
    return accessibleOwnerUnitsByUser.get(userId) ?? [];
  }

  async getAccessibleUnitOrThrow(userId: string, unitId: string) {
    const unit = (accessibleOwnerUnitsByUser.get(userId) ?? []).find(
      (entry) => entry.unitId === unitId,
    );
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }
}

describe('Messaging (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let orgA: OrgRecord;
  let orgB: OrgRecord;
  let adminA: UserRecord;
  let managerA: UserRecord;
  let staffA: UserRecord;
  let ownerA: UserRecord;
  let ownerB: UserRecord;
  let ownerRecordA: OwnerRecord;
  let ownerRecordB: OwnerRecord;
  let residentA: UserRecord;
  let residentB: UserRecord;
  let residentC: UserRecord;
  let orgUserB: UserRecord;
  let buildingA: BuildingRecord;
  let buildingB: BuildingRecord;
  let unitA1: UnitRecord;
  let unitA2: UnitRecord;
  let unitB1: UnitRecord;

  const permissionsByUser = new Map<string, Set<string>>();

  const grantPermissions = (userId: string, permissions: string[]) => {
    permissionsByUser.set(userId, new Set(permissions));
  };

  const createConversation = async (
    userId: string,
    body: Record<string, unknown>,
  ) => {
    return fetch(`${baseUrl}/org/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(body),
    });
  };

  const createOwnerManagementConversation = async (
    userId: string,
    body: Record<string, unknown>,
  ) => {
    return fetch(`${baseUrl}/owner/messages/management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(body),
    });
  };

  const createOwnerTenantConversation = async (
    userId: string,
    body: Record<string, unknown>,
  ) => {
    return fetch(`${baseUrl}/owner/messages/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(body),
    });
  };

  const createResidentOwnerConversation = async (
    userId: string,
    body: Record<string, unknown>,
  ) => {
    return fetch(`${baseUrl}/resident/messages/owner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(body),
    });
  };

  const listResidentManagementContacts = async (
    userId: string,
  ): Promise<Response> => {
    return fetch(`${baseUrl}/resident/messages/management-contacts`, {
      headers: { 'x-user-id': userId },
    });
  };

  const getConversationUnreadCount = async (
    userId: string,
  ): Promise<{ unreadCount: number }> => {
    const response = await fetch(`${baseUrl}/org/conversations/unread-count`, {
      headers: { 'x-user-id': userId },
    });
    expect(response.status).toBe(200);
    return response.json();
  };

  const getOwnerConversationUnreadCount = async (
    userId: string,
  ): Promise<{ unreadCount: number }> => {
    const response = await fetch(
      `${baseUrl}/owner/conversations/unread-count`,
      {
        headers: { 'x-user-id': userId },
      },
    );
    expect(response.status).toBe(200);
    return response.json();
  };

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [
        MessagingController,
        ResidentMessagingController,
        OwnerMessagingController,
      ],
      providers: [
        MessagingService,
        MessagingRepo,
        OrgScopeGuard,
        PermissionsGuard,
        OwnerPortfolioGuard,
        BuildingAccessService,
        {
          provide: BuildingScopeResolverService,
          useValue: {
            resolveForRequest: async () => undefined,
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserEffectivePermissions: async (
              userId: string,
              scope?: { buildingId?: string },
            ) => {
              const effective =
                permissionsByUser.get(userId) ?? new Set<string>();
              if (
                userId === adminA?.id ||
                userId === residentA?.id ||
                userId === residentB?.id ||
                userId === residentC?.id
              ) {
                return effective;
              }
              if (scope?.buildingId) {
                const isAssigned = prisma.hasBuildingAssignment(
                  userId,
                  scope.buildingId,
                );
                return isAssigned ? effective : new Set<string>();
              }
              return new Set<string>();
            },
            getUserEffectivePermissionsAcrossAnyScope: async (userId: string) =>
              permissionsByUser.get(userId) ?? new Set<string>(),
            getUserScopedAssignments: async (
              userId: string,
              context?: { orgId?: string },
            ) => ({
              assignments:
                userId === adminA?.id && context?.orgId === orgA?.id
                  ? [
                      {
                        scopeType: 'ORG',
                        roleTemplate: { key: 'org_admin' },
                      },
                    ]
                  : [],
              rolePermissionKeys:
                userId === adminA?.id && context?.orgId === orgA?.id
                  ? ['messaging.write']
                  : [],
              userOverrides: [],
            }),
          },
        },
        {
          provide: NotificationsRealtimeService,
          useValue: {
            publishToUser: () => undefined,
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            createForUsers: () => [],
          },
        },
        {
          provide: OwnerPortfolioScopeService,
          useClass: TestOwnerPortfolioScopeService,
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
    ownerAccessByUser.clear();
    orgScopedMessagingUsersByOrg.clear();
    accessibleOwnerUnitsByUser.clear();

    orgA = await prisma.org.create({ data: { name: 'Org A' } });
    orgB = await prisma.org.create({ data: { name: 'Org B' } });

    buildingA = await prisma.building.create({
      data: { orgId: orgA.id, name: 'Building A' },
    });
    buildingB = await prisma.building.create({
      data: { orgId: orgA.id, name: 'Building B' },
    });
    unitA1 = await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-101' },
    });
    unitA2 = await prisma.unit.create({
      data: { buildingId: buildingA.id, label: 'A-102' },
    });
    unitB1 = await prisma.unit.create({
      data: { buildingId: buildingB.id, label: 'B-201' },
    });
    ownerRecordA = await prisma.owner.create({
      data: {
        orgId: orgA.id,
        isActive: true,
      },
    });
    ownerRecordB = await prisma.owner.create({
      data: {
        orgId: orgA.id,
        isActive: true,
      },
    });

    adminA = await prisma.user.create({
      data: {
        email: 'admin@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Admin A',
      },
    });
    orgScopedMessagingUsersByOrg.set(orgA.id, new Set([adminA.id]));
    managerA = await prisma.user.create({
      data: {
        email: 'manager@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Manager A',
      },
    });
    staffA = await prisma.user.create({
      data: {
        email: 'staff@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Staff A',
      },
    });
    ownerA = await prisma.user.create({
      data: {
        email: 'owner@portfolio.test',
        orgId: null,
        isActive: true,
        name: 'Owner A',
      },
    });
    ownerB = await prisma.user.create({
      data: {
        email: 'owner-b@portfolio.test',
        orgId: null,
        isActive: true,
        name: 'Owner B',
      },
    });
    residentA = await prisma.user.create({
      data: {
        email: 'resident-a@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident A',
      },
    });
    residentB = await prisma.user.create({
      data: {
        email: 'resident-b@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident B',
      },
    });
    residentC = await prisma.user.create({
      data: {
        email: 'resident-c@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Resident C',
      },
    });
    orgUserB = await prisma.user.create({
      data: {
        email: 'user@orgb.test',
        orgId: orgB.id,
        isActive: true,
        name: 'Org B User',
      },
    });

    await prisma.buildingAssignment.create({
      data: { buildingId: buildingA.id, userId: managerA.id, type: 'MANAGER' },
    });

    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: residentA.id,
        status: 'ACTIVE',
      },
    });
    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA2.id,
        residentUserId: residentB.id,
        status: 'ACTIVE',
      },
    });
    await prisma.occupancy.create({
      data: {
        buildingId: buildingB.id,
        unitId: unitB1.id,
        residentUserId: residentC.id,
        status: 'ACTIVE',
      },
    });

    grantPermissions(adminA.id, [
      'messaging.read',
      'messaging.write',
      'users.write',
    ]);
    grantPermissions(managerA.id, ['messaging.read', 'messaging.write']);
    grantPermissions(staffA.id, ['messaging.read', 'messaging.write']);
    grantPermissions(residentA.id, ['messaging.read', 'messaging.write']);
    grantPermissions(residentB.id, ['messaging.read', 'messaging.write']);
    grantPermissions(residentC.id, ['messaging.read', 'messaging.write']);
    grantPermissions(orgUserB.id, ['messaging.read', 'messaging.write']);

    ownerAccessByUser.set(ownerA.id, true);
    accessibleOwnerUnitsByUser.set(ownerA.id, [
      {
        orgId: orgA.id,
        orgName: orgA.name,
        ownerId: ownerRecordA.id,
        unitId: unitA1.id,
        buildingId: buildingA.id,
        buildingName: buildingA.name,
        unitLabel: unitA1.label,
      },
    ]);
    ownerAccessByUser.set(ownerB.id, true);
    accessibleOwnerUnitsByUser.set(ownerB.id, [
      {
        orgId: orgA.id,
        orgName: orgA.name,
        ownerId: ownerRecordB.id,
        unitId: unitB1.id,
        buildingId: buildingB.id,
        buildingName: buildingB.name,
        unitLabel: unitB1.label,
      },
    ]);

    await prisma.unitOwnership.create({
      data: {
        orgId: orgA.id,
        unitId: unitA1.id,
        ownerId: ownerRecordA.id,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.unitOwnership.create({
      data: {
        orgId: orgA.id,
        unitId: unitB1.id,
        ownerId: ownerRecordB.id,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.ownerAccessGrant.create({
      data: {
        ownerId: ownerRecordA.id,
        userId: ownerA.id,
        status: 'ACTIVE',
      },
    });
    await prisma.ownerAccessGrant.create({
      data: {
        ownerId: ownerRecordB.id,
        userId: ownerB.id,
        status: 'ACTIVE',
      },
    });
  });

  it('allows participants to create and reply to conversations', async () => {
    const createResponse = await createConversation(adminA.id, {
      participantUserIds: [residentA.id],
      subject: 'Welcome',
      message: 'Hello there',
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.participants).toHaveLength(2);
    expect(created.type).toBe('MANAGEMENT_TENANT');
    expect(created.counterpartyGroup).toBe('TENANT');
    expect(created.messages).toHaveLength(1);
    expect(created.messages[0].content).toBe('Hello there');

    const replyResponse = await fetch(
      `${baseUrl}/org/conversations/${created.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': residentA.id,
        },
        body: JSON.stringify({ content: 'Hi!' }),
      },
    );
    expect(replyResponse.status).toBe(201);
    const reply = await replyResponse.json();
    expect(reply.content).toBe('Hi!');

    const detailResponse = await fetch(
      `${baseUrl}/org/conversations/${created.id}`,
      { headers: { 'x-user-id': adminA.id } },
    );
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.messages).toHaveLength(2);
  });

  it('lists conversations only for participants', async () => {
    const createResponse = await createConversation(adminA.id, {
      participantUserIds: [residentA.id],
      message: 'Hello',
    });
    expect(createResponse.status).toBe(201);

    const residentList = await fetch(`${baseUrl}/org/conversations`, {
      headers: { 'x-user-id': residentA.id },
    });
    expect(residentList.status).toBe(200);
    const residentPayload = await residentList.json();
    expect(residentPayload.items).toHaveLength(1);

    const staffList = await fetch(`${baseUrl}/org/conversations`, {
      headers: { 'x-user-id': staffA.id },
    });
    expect(staffList.status).toBe(200);
    const staffPayload = await staffList.json();
    expect(staffPayload.items).toHaveLength(0);
  });

  it('returns unread org conversation count for the current participant only', async () => {
    const createResponse = await createConversation(adminA.id, {
      participantUserIds: [residentA.id],
      message: 'Initial hello',
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    await expect(getConversationUnreadCount(residentA.id)).resolves.toEqual({
      unreadCount: 1,
    });
    await expect(getConversationUnreadCount(adminA.id)).resolves.toEqual({
      unreadCount: 0,
    });

    const replyResponse = await fetch(
      `${baseUrl}/org/conversations/${created.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': residentA.id,
        },
        body: JSON.stringify({ content: 'Reply back' }),
      },
    );
    expect(replyResponse.status).toBe(201);

    await expect(getConversationUnreadCount(adminA.id)).resolves.toEqual({
      unreadCount: 1,
    });
    await expect(getConversationUnreadCount(residentA.id)).resolves.toEqual({
      unreadCount: 0,
    });

    const readResponse = await fetch(
      `${baseUrl}/org/conversations/${created.id}/read`,
      {
        method: 'POST',
        headers: { 'x-user-id': adminA.id },
      },
    );
    expect(readResponse.status).toBe(200);

    await expect(getConversationUnreadCount(adminA.id)).resolves.toEqual({
      unreadCount: 0,
    });
  });

  it('blocks non-participants from sending messages', async () => {
    const createResponse = await createConversation(adminA.id, {
      participantUserIds: [residentA.id],
      message: 'Hello',
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const response = await fetch(
      `${baseUrl}/org/conversations/${created.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': staffA.id,
        },
        body: JSON.stringify({ content: 'Not allowed' }),
      },
    );
    expect(response.status).toBe(403);
  });

  it('enforces building-scoped participant rules for managers', async () => {
    const allowed = await createConversation(managerA.id, {
      participantUserIds: [residentA.id],
      buildingId: buildingA.id,
      message: 'Building A only',
    });
    expect(allowed.status).toBe(201);

    const wrongResident = await createConversation(managerA.id, {
      participantUserIds: [residentC.id],
      buildingId: buildingA.id,
      message: 'Should fail',
    });
    expect(wrongResident.status).toBe(403);

    const wrongBuilding = await createConversation(managerA.id, {
      participantUserIds: [residentB.id],
      buildingId: buildingB.id,
      message: 'Should also fail',
    });
    expect(wrongBuilding.status).toBe(403);
  });

  it('returns 404 when non-participants fetch a conversation', async () => {
    const createResponse = await createConversation(adminA.id, {
      participantUserIds: [residentA.id],
      message: 'Hello',
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/org/conversations/${created.id}`, {
      headers: { 'x-user-id': orgUserB.id },
    });
    expect(response.status).toBe(404);
  });

  it('allows an owner to create, list, read, and reply to management conversations for an accessible unit', async () => {
    const createResponse = await createOwnerManagementConversation(ownerA.id, {
      unitId: unitA1.id,
      subject: 'Approval follow-up',
      message: 'Please share the latest vendor quote.',
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.orgId).toBe(buildingA.orgId);
    expect(created.orgName).toBe('Org A');
    expect(created.buildingId).toBe(buildingA.id);
    expect(created.buildingName).toBe(buildingA.name);
    expect(created.type).toBe('MANAGEMENT_OWNER');
    expect(created.counterpartyGroup).toBe('OWNER');
    expect(created.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownerA.id }),
        expect.objectContaining({ id: managerA.id }),
      ]),
    );

    const listResponse = await fetch(`${baseUrl}/owner/conversations`, {
      headers: { 'x-user-id': ownerA.id },
    });
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.items).toHaveLength(1);
    expect(listPayload.items[0].id).toBe(created.id);

    const detailResponse = await fetch(
      `${baseUrl}/owner/conversations/${created.id}`,
      {
        headers: { 'x-user-id': ownerA.id },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.messages).toHaveLength(1);

    const replyResponse = await fetch(
      `${baseUrl}/owner/conversations/${created.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': ownerA.id,
        },
        body: JSON.stringify({ content: 'Following up on this today.' }),
      },
    );
    expect(replyResponse.status).toBe(201);

    const readResponse = await fetch(
      `${baseUrl}/owner/conversations/${created.id}/read`,
      {
        method: 'POST',
        headers: { 'x-user-id': ownerA.id },
      },
    );
    expect(readResponse.status).toBe(200);
  });

  it('returns unread owner conversation count across participant-visible conversations', async () => {
    const createResponse = await createOwnerManagementConversation(ownerA.id, {
      unitId: unitA1.id,
      message: 'Need a vendor update.',
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    await expect(getOwnerConversationUnreadCount(ownerA.id)).resolves.toEqual({
      unreadCount: 0,
    });
    await expect(getConversationUnreadCount(managerA.id)).resolves.toEqual({
      unreadCount: 1,
    });

    const replyResponse = await fetch(
      `${baseUrl}/org/conversations/${created.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': managerA.id,
        },
        body: JSON.stringify({ content: 'Vendor is scheduled tomorrow.' }),
      },
    );
    expect(replyResponse.status).toBe(201);

    await expect(getOwnerConversationUnreadCount(ownerA.id)).resolves.toEqual({
      unreadCount: 1,
    });

    const readResponse = await fetch(
      `${baseUrl}/owner/conversations/${created.id}/read`,
      {
        method: 'POST',
        headers: { 'x-user-id': ownerA.id },
      },
    );
    expect(readResponse.status).toBe(200);

    await expect(getOwnerConversationUnreadCount(ownerA.id)).resolves.toEqual({
      unreadCount: 0,
    });
  });

  it('allows an owner to message a tenant only when the tenant is active in the accessible unit', async () => {
    const allowed = await createOwnerTenantConversation(ownerA.id, {
      unitId: unitA1.id,
      tenantUserId: residentA.id,
      subject: 'Unit access',
      message: 'Please coordinate the repair window.',
    });
    expect(allowed.status).toBe(201);
    const allowedPayload = await allowed.json();
    expect(allowedPayload.type).toBe('OWNER_TENANT');
    expect(allowedPayload.counterpartyGroup).toBe('MIXED');
    expect(allowedPayload.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownerA.id }),
        expect.objectContaining({ id: residentA.id }),
      ]),
    );

    const forbidden = await createOwnerTenantConversation(ownerA.id, {
      unitId: unitA1.id,
      tenantUserId: residentB.id,
      message: 'This should fail.',
    });
    expect(forbidden.status).toBe(403);
  });

  it('keeps owner conversations private to participants and blocks owner routes immediately when owner access is removed', async () => {
    const createResponse = await createOwnerManagementConversation(ownerA.id, {
      unitId: unitA1.id,
      message: 'Private owner thread.',
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const otherOwnerFetch = await fetch(
      `${baseUrl}/owner/conversations/${created.id}`,
      {
        headers: { 'x-user-id': ownerB.id },
      },
    );
    expect(otherOwnerFetch.status).toBe(404);

    ownerAccessByUser.set(ownerA.id, false);
    accessibleOwnerUnitsByUser.set(ownerA.id, []);

    const blockedList = await fetch(`${baseUrl}/owner/conversations`, {
      headers: { 'x-user-id': ownerA.id },
    });
    expect(blockedList.status).toBe(403);

    const blockedCreate = await createOwnerManagementConversation(ownerA.id, {
      unitId: unitA1.id,
      message: 'Should not be allowed.',
    });
    expect(blockedCreate.status).toBe(403);
  });

  it('allows a resident to start a conversation with assigned building management', async () => {
    const response = await fetch(`${baseUrl}/resident/messages/management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        subject: 'Need access card help',
        message: 'Please call me at the lobby.',
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.buildingId).toBe(buildingA.id);
    expect(payload.type).toBe('MANAGEMENT_TENANT');
    expect(payload.counterpartyGroup).toBe('TENANT');
    expect(payload.subject).toBe('Need access card help');
    expect(payload.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: residentA.id }),
        expect.objectContaining({ id: managerA.id }),
      ]),
    );
    expect(payload.messages[0].content).toBe('Please call me at the lobby.');
  });

  it('lists only allowed management contacts for the resident building and supports targeting one contact', async () => {
    await prisma.buildingAssignment.create({
      data: { buildingId: buildingA.id, userId: staffA.id, type: 'STAFF' },
    });

    const contactsResponse = await listResidentManagementContacts(residentA.id);
    expect(contactsResponse.status).toBe(200);
    const contacts = await contactsResponse.json();
    expect(contacts).toEqual([
      expect.objectContaining({ id: adminA.id, name: 'Admin A' }),
      expect.objectContaining({ id: managerA.id, name: 'Manager A' }),
      expect.objectContaining({ id: staffA.id, name: 'Staff A' }),
    ]);

    const response = await fetch(`${baseUrl}/resident/messages/management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        managementUserId: staffA.id,
        subject: 'Need a specific contact',
        message: 'Please handle this directly.',
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: residentA.id }),
        expect.objectContaining({ id: staffA.id }),
      ]),
    );
    expect(payload.participants).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: managerA.id })]),
    );
  });

  it('rejects a resident-selected management contact outside the allowed building scope', async () => {
    const response = await fetch(`${baseUrl}/resident/messages/management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentA.id,
      },
      body: JSON.stringify({
        managementUserId: orgUserB.id,
        message: 'This should fail.',
      }),
    });

    expect(response.status).toBe(403);
  });

  it('allows a resident to start a conversation with the current unit owner', async () => {
    const response = await createResidentOwnerConversation(residentA.id, {
      subject: 'Lease question',
      message: 'Can we discuss the next renewal?',
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.buildingId).toBe(buildingA.id);
    expect(payload.type).toBe('OWNER_TENANT');
    expect(payload.counterpartyGroup).toBe('MIXED');
    expect(payload.subject).toBe('Lease question');
    expect(payload.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: residentA.id }),
        expect.objectContaining({ id: ownerA.id }),
      ]),
    );
    expect(payload.messages[0].content).toBe(
      'Can we discuss the next renewal?',
    );
  });

  it('returns 409 when the resident unit has no active owner user', async () => {
    const response = await createResidentOwnerConversation(residentB.id, {
      message: 'Is anyone there?',
    });

    expect(response.status).toBe(409);
  });

  it('hides former resident conversations until the same user becomes active again', async () => {
    const formerResident = await prisma.user.create({
      data: {
        email: 'former-resident@org.test',
        orgId: orgA.id,
        isActive: true,
        name: 'Former Resident',
      },
    });
    grantPermissions(formerResident.id, ['messaging.read', 'messaging.write']);

    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: formerResident.id,
        status: 'ENDED',
      },
    });

    const createResponse = await createConversation(adminA.id, {
      participantUserIds: [formerResident.id],
      buildingId: buildingA.id,
      subject: 'History check',
      message: 'This should stay hidden while former.',
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const formerList = await fetch(`${baseUrl}/org/conversations`, {
      headers: { 'x-user-id': formerResident.id },
    });
    expect(formerList.status).toBe(403);

    const formerGet = await fetch(
      `${baseUrl}/org/conversations/${created.id}`,
      {
        headers: { 'x-user-id': formerResident.id },
      },
    );
    expect(formerGet.status).toBe(403);

    const formerReply = await fetch(
      `${baseUrl}/org/conversations/${created.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': formerResident.id,
        },
        body: JSON.stringify({ content: 'Can I still reply?' }),
      },
    );
    expect(formerReply.status).toBe(403);

    await prisma.occupancy.create({
      data: {
        buildingId: buildingA.id,
        unitId: unitA1.id,
        residentUserId: formerResident.id,
        status: 'ACTIVE',
      },
    });

    const restoredList = await fetch(`${baseUrl}/org/conversations`, {
      headers: { 'x-user-id': formerResident.id },
    });
    expect(restoredList.status).toBe(200);
    const restoredPayload = await restoredList.json();
    expect(restoredPayload.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const restoredReply = await fetch(
      `${baseUrl}/org/conversations/${created.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': formerResident.id,
        },
        body: JSON.stringify({ content: 'I am back now.' }),
      },
    );
    expect(restoredReply.status).toBe(201);
  });

  it('returns 409 when no management users are assigned to the resident building', async () => {
    orgScopedMessagingUsersByOrg.set(orgA.id, new Set());

    const response = await fetch(`${baseUrl}/resident/messages/management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': residentC.id,
      },
      body: JSON.stringify({
        message: 'Anybody there?',
      }),
    });

    expect(response.status).toBe(409);
  });

  it('filters org conversations by counterparty group for management inbox views', async () => {
    const managementConversation = await createConversation(adminA.id, {
      participantUserIds: [residentA.id],
      buildingId: buildingA.id,
      message: 'Tenant thread',
    });
    expect(managementConversation.status).toBe(201);

    const internalConversation = await createConversation(adminA.id, {
      participantUserIds: [managerA.id],
      message: 'Internal thread',
    });
    expect(internalConversation.status).toBe(201);

    const tenantList = await fetch(
      `${baseUrl}/org/conversations?counterpartyGroup=TENANT`,
      {
        headers: { 'x-user-id': adminA.id },
      },
    );
    expect(tenantList.status).toBe(200);
    const tenantPayload = await tenantList.json();
    expect(tenantPayload.items).toHaveLength(1);
    expect(tenantPayload.items[0].counterpartyGroup).toBe('TENANT');
    expect(tenantPayload.items[0].type).toBe('MANAGEMENT_TENANT');

    const staffList = await fetch(
      `${baseUrl}/org/conversations?counterpartyGroup=STAFF`,
      {
        headers: { 'x-user-id': adminA.id },
      },
    );
    expect(staffList.status).toBe(200);
    const staffPayload = await staffList.json();
    expect(staffPayload.items).toHaveLength(1);
    expect(staffPayload.items[0].counterpartyGroup).toBe('STAFF');
    expect(staffPayload.items[0].type).toBe('MANAGEMENT_INTERNAL');
  });
});

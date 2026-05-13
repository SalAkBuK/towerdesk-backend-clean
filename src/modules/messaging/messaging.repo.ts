import { Injectable } from '@nestjs/common';
import {
  ConversationCounterpartyGroup,
  ConversationType,
  OwnerAccessGrantStatus,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

type CursorInfo = {
  id: string;
  updatedAt: Date;
};

const conversationInclude = {
  org: {
    select: {
      id: true,
      name: true,
    },
  },
  building: {
    select: {
      id: true,
      name: true,
    },
  },
  participants: {
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  messages: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      senderUser: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
};

const conversationWithLastMessageInclude = {
  org: {
    select: {
      id: true,
      name: true,
    },
  },
  building: {
    select: {
      id: true,
      name: true,
    },
  },
  participants: {
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      senderUser: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
};

const conversationUnreadCountInclude = {
  participants: true,
  messages: {
    select: {
      createdAt: true,
    },
  },
};

@Injectable()
export class MessagingRepo {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(
    input: {
      orgId: string;
      buildingId?: string | null;
      type: ConversationType;
      counterpartyGroup: ConversationCounterpartyGroup;
      subject?: string | null;
      participantUserIds: string[];
      initialMessage: { senderUserId: string; content: string };
    },
    tx?: DbClient,
  ) {
    const prisma = tx ?? this.prisma;

    const created = await prisma.conversation.create({
      data: {
        orgId: input.orgId,
        buildingId: input.buildingId ?? null,
        type: input.type,
        counterpartyGroup: input.counterpartyGroup,
        subject: input.subject ?? null,
        participants: {
          create: input.participantUserIds.map((userId) => ({
            userId,
            lastReadAt:
              userId === input.initialMessage.senderUserId ? new Date() : null,
          })),
        },
        messages: {
          create: {
            senderUserId: input.initialMessage.senderUserId,
            content: input.initialMessage.content,
          },
        },
      },
      include: conversationInclude,
    });

    const initialMessageCreatedAt = created.messages[0]?.createdAt;
    if (initialMessageCreatedAt) {
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: created.id,
          userId: input.initialMessage.senderUserId,
        },
        data: {
          lastReadAt: initialMessageCreatedAt,
        },
      });

      const senderParticipant = created.participants.find(
        (participant) =>
          participant.userId === input.initialMessage.senderUserId,
      );
      if (senderParticipant) {
        senderParticipant.lastReadAt = initialMessageCreatedAt;
      }
    }

    return created;
  }

  async findConversationById(conversationId: string, orgId: string) {
    return this.prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      include: conversationInclude,
    });
  }

  async findConversationByIdForUser(
    conversationId: string,
    userId: string,
    orgId: string,
  ) {
    return this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        orgId,
        participants: { some: { userId } },
      },
      include: conversationInclude,
    });
  }

  async findConversationByIdForUserAcrossOrgs(
    conversationId: string,
    userId: string,
  ) {
    return this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId } },
      },
      include: conversationInclude,
    });
  }

  async listConversationsForUser(
    userId: string,
    orgId: string,
    options: {
      take: number;
      cursor?: CursorInfo;
      type?: ConversationType;
      counterpartyGroup?: ConversationCounterpartyGroup;
    },
  ) {
    type WhereClause = {
      orgId: string;
      type?: ConversationType;
      counterpartyGroup?: ConversationCounterpartyGroup;
      participants: { some: { userId: string } };
      OR?: (
        | { updatedAt: { lt: Date } }
        | { updatedAt: Date; id: { lt: string } }
      )[];
    };

    const where: WhereClause = {
      orgId,
      participants: { some: { userId } },
    };
    if (options.type) {
      where.type = options.type;
    }
    if (options.counterpartyGroup) {
      where.counterpartyGroup = options.counterpartyGroup;
    }

    if (options.cursor) {
      where.OR = [
        { updatedAt: { lt: options.cursor.updatedAt } },
        { updatedAt: options.cursor.updatedAt, id: { lt: options.cursor.id } },
      ];
    }

    return this.prisma.conversation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: options.take,
      include: conversationWithLastMessageInclude,
    });
  }

  async listConversationsForUserAcrossOrgs(
    userId: string,
    options: {
      take: number;
      cursor?: CursorInfo;
      type?: ConversationType;
      counterpartyGroup?: ConversationCounterpartyGroup;
    },
  ) {
    type WhereClause = {
      type?: ConversationType;
      counterpartyGroup?: ConversationCounterpartyGroup;
      participants: { some: { userId: string } };
      OR?: (
        | { updatedAt: { lt: Date } }
        | { updatedAt: Date; id: { lt: string } }
      )[];
    };

    const where: WhereClause = {
      participants: { some: { userId } },
    };
    if (options.type) {
      where.type = options.type;
    }
    if (options.counterpartyGroup) {
      where.counterpartyGroup = options.counterpartyGroup;
    }

    if (options.cursor) {
      where.OR = [
        { updatedAt: { lt: options.cursor.updatedAt } },
        { updatedAt: options.cursor.updatedAt, id: { lt: options.cursor.id } },
      ];
    }

    return this.prisma.conversation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: options.take,
      include: conversationWithLastMessageInclude,
    });
  }

  async countUnreadMessagesForUser(userId: string, orgId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        orgId,
        participants: { some: { userId } },
      },
      include: conversationUnreadCountInclude,
    });

    return this.countUnreadMessagesFromConversations(conversations, userId);
  }

  async countUnreadMessagesForUserAcrossOrgs(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: conversationUnreadCountInclude,
    });

    return this.countUnreadMessagesFromConversations(conversations, userId);
  }

  async addMessage(
    conversationId: string,
    senderUserId: string,
    content: string,
    tx?: DbClient,
  ) {
    const prisma = tx ?? this.prisma;

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderUserId,
        content,
      },
      include: {
        senderUser: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    // Update conversation's updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Update sender's lastReadAt
    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: senderUserId },
      data: { lastReadAt: new Date() },
    });

    return message;
  }

  async markConversationAsRead(
    conversationId: string,
    userId: string,
    tx?: DbClient,
  ) {
    const prisma = tx ?? this.prisma;

    return prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });
  }

  async isUserParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    return Boolean(participant);
  }

  async getConversationParticipantUserIds(conversationId: string) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return participants.map((p) => p.userId);
  }

  async getConversationParticipantRoleBuckets(
    userIds: string[],
    orgId: string,
  ) {
    const [staffAssignments, occupancies, ownerAccessGrants] =
      await Promise.all([
        this.prisma.userAccessAssignment.findMany({
          where: {
            userId: { in: userIds },
            roleTemplate: {
              orgId,
              rolePermissions: {
                some: {
                  permission: {
                    key: 'messaging.write',
                  },
                },
              },
            },
            user: { isActive: true },
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.occupancy.findMany({
          where: {
            residentUserId: { in: userIds },
            status: 'ACTIVE',
            building: { orgId },
            residentUser: { isActive: true },
          },
          select: { residentUserId: true },
          distinct: ['residentUserId'],
        }),
        this.prisma.ownerAccessGrant.findMany({
          where: {
            userId: { in: userIds },
            status: OwnerAccessGrantStatus.ACTIVE,
            owner: {
              orgId,
              isActive: true,
            },
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);

    return {
      staffUserIds: staffAssignments.map((assignment) => assignment.userId),
      tenantUserIds: occupancies.map((occupancy) => occupancy.residentUserId),
      ownerUserIds: ownerAccessGrants
        .map((grant) => grant.userId)
        .filter((userId): userId is string => Boolean(userId)),
    };
  }

  async getUserBuildingIdsWithPermission(
    userId: string,
    orgId: string,
    permissionKey: string,
  ) {
    const assignments = await this.prisma.userAccessAssignment.findMany({
      where: {
        userId,
        scopeType: 'BUILDING',
        roleTemplate: {
          orgId,
          scopeType: 'BUILDING',
          rolePermissions: {
            some: {
              permission: {
                key: permissionKey,
              },
            },
          },
        },
      },
      select: { scopeId: true },
      distinct: ['scopeId'],
    });
    return assignments
      .map((assignment) => assignment.scopeId)
      .filter((scopeId): scopeId is string => Boolean(scopeId));
  }

  async validateUsersInOrg(userIds: string[], orgId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        orgId,
        isActive: true,
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async getActiveResidentUserIdsInBuilding(buildingId: string) {
    const occupancies = await this.prisma.occupancy.findMany({
      where: {
        buildingId,
        status: 'ACTIVE',
        residentUser: { isActive: true },
      },
      select: { residentUserId: true },
      distinct: ['residentUserId'],
    });
    return occupancies.map((o) => o.residentUserId);
  }

  async findActiveOccupancyByResident(userId: string, orgId: string) {
    return this.prisma.occupancy.findFirst({
      where: {
        residentUserId: userId,
        status: 'ACTIVE',
        building: { orgId },
      },
      select: {
        id: true,
        buildingId: true,
        unitId: true,
      },
    });
  }

  async hasOccupancyHistoryByResident(userId: string, orgId: string) {
    const occupancy = await this.prisma.occupancy.findFirst({
      where: {
        residentUserId: userId,
        building: { orgId },
      },
      select: { id: true },
    });

    return Boolean(occupancy);
  }

  async getActiveOwnerUserIdsForUnit(unitId: string, orgId: string) {
    const activeOwnership = await this.prisma.unitOwnership.findFirst({
      where: {
        orgId,
        unitId,
        endDate: null,
        owner: {
          isActive: true,
          accessGrants: {
            some: {
              status: OwnerAccessGrantStatus.ACTIVE,
              userId: { not: null },
            },
          },
        },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        ownerId: true,
      },
    });

    const fallbackUnit = activeOwnership
      ? null
      : await this.prisma.unit.findFirst({
          where: {
            id: unitId,
            building: { orgId },
            ownerId: { not: null },
            ownerships: {
              none: {
                endDate: null,
              },
            },
            owner: {
              isActive: true,
              accessGrants: {
                some: {
                  status: OwnerAccessGrantStatus.ACTIVE,
                  userId: { not: null },
                },
              },
            },
          },
          select: {
            ownerId: true,
          },
        });

    const ownerId = activeOwnership?.ownerId ?? fallbackUnit?.ownerId;
    if (!ownerId) {
      return [];
    }

    const grants = await this.prisma.ownerAccessGrant.findMany({
      where: {
        ownerId,
        status: OwnerAccessGrantStatus.ACTIVE,
        userId: { not: null },
        owner: {
          isActive: true,
        },
      },
      select: {
        userId: true,
      },
    });

    return Array.from(
      new Set(
        grants
          .map((grant) => grant.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
  }

  async findActiveOccupancyForResidentInUnit(
    residentUserId: string,
    unitId: string,
  ) {
    return this.prisma.occupancy.findFirst({
      where: {
        residentUserId,
        unitId,
        status: 'ACTIVE',
        residentUser: { isActive: true },
      },
      select: {
        id: true,
        buildingId: true,
        unitId: true,
      },
    });
  }

  async getManagementUserIdsForBuilding(buildingId: string, orgId: string) {
    const [buildingAssignments, orgAssignments] = await Promise.all([
      this.prisma.userAccessAssignment.findMany({
        where: {
          scopeType: 'BUILDING',
          scopeId: buildingId,
          roleTemplate: {
            orgId,
            scopeType: 'BUILDING',
            rolePermissions: {
              some: {
                permission: {
                  key: 'messaging.write',
                },
              },
            },
          },
          user: { isActive: true, orgId },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.userAccessAssignment.findMany({
        where: {
          scopeType: 'ORG',
          scopeId: null,
          roleTemplate: {
            orgId,
            scopeType: 'ORG',
            rolePermissions: {
              some: {
                permission: {
                  key: 'messaging.write',
                },
              },
            },
          },
          user: { isActive: true, orgId },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    return Array.from(
      new Set([
        ...buildingAssignments.map((assignment) => assignment.userId),
        ...orgAssignments.map((assignment) => assignment.userId),
      ]),
    );
  }

  async listManagementUsersForBuilding(buildingId: string, orgId: string) {
    const managementUserIds = await this.getManagementUserIdsForBuilding(
      buildingId,
      orgId,
    );

    if (managementUserIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: managementUserIds },
        orgId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
      },
    });

    return users
      .map((user) => ({
        id: user.id,
        name: user.name ?? 'Unknown',
        avatarUrl: user.avatarUrl ?? null,
      }))
      .sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) {
          return nameCompare;
        }
        return a.id.localeCompare(b.id);
      });
  }

  private countUnreadMessagesFromConversations(
    conversations: Array<{
      participants: Array<{ userId: string; lastReadAt: Date | null }>;
      messages: Array<{ createdAt: Date }>;
    }>,
    userId: string,
  ) {
    return conversations.reduce((total, conversation) => {
      const participant = conversation.participants.find(
        (item) => item.userId === userId,
      );
      if (!participant) {
        return total;
      }

      const unreadCount = participant.lastReadAt
        ? conversation.messages.filter(
            (message) => message.createdAt > participant.lastReadAt!,
          ).length
        : conversation.messages.length;

      return total + unreadCount;
    }, 0);
  }
}

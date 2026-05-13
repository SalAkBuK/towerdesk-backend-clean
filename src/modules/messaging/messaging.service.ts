import {
  ConversationCounterpartyGroup,
  ConversationType,
} from '@prisma/client';
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { MessagingRepo } from './messaging.repo';
import { AccessControlService } from '../access-control/access-control.service';
import { BuildingAccessService } from '../../common/building-access/building-access.service';
import { NotificationsRealtimeService } from '../notifications/notifications-realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationTypeEnum } from '../notifications/notifications.constants';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateOwnerManagementConversationDto } from './dto/create-owner-management-conversation.dto';
import { CreateOwnerTenantConversationDto } from './dto/create-owner-tenant-conversation.dto';
import { CreateResidentManagementConversationDto } from './dto/create-resident-management-conversation.dto';
import { CreateResidentOwnerConversationDto } from './dto/create-resident-owner-conversation.dto';
import { ManagementContactResponseDto } from './dto/management-contact.response.dto';
import { toMessageResponse } from './dto/message.response.dto';
import { OwnerPortfolioScopeService } from '../owner-portfolio/owner-portfolio-scope.service';
import {
  getCounterpartyGroupForConversationType,
  inferConversationClassification,
} from './conversation-classification';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ORG_SCOPED_MESSAGING_PERMISSION = 'messaging.write';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly messagingRepo: MessagingRepo,
    private readonly accessControlService: AccessControlService,
    private readonly buildingAccessService: BuildingAccessService,
    private readonly realtimeService: NotificationsRealtimeService,
    private readonly notificationsService: NotificationsService,
    private readonly ownerPortfolioScopeService: OwnerPortfolioScopeService,
  ) {}

  async createConversation(
    user: AuthenticatedUser,
    orgId: string,
    dto: CreateConversationDto,
  ) {
    const userId = user.sub;

    // Org-only permission resolution distinguishes org-scoped messaging access
    // from building-scoped messaging roles.
    const effectivePermissions =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
      });
    const hasOrgWideMessagingAccess = effectivePermissions.has(
      ORG_SCOPED_MESSAGING_PERMISSION,
    );

    // Validate participants exist in org
    const validParticipantIds = await this.messagingRepo.validateUsersInOrg(
      dto.participantUserIds,
      orgId,
    );

    if (validParticipantIds.length === 0) {
      throw new BadRequestException('No valid participants found');
    }

    if (!dto.buildingId && !hasOrgWideMessagingAccess) {
      throw new BadRequestException(
        'buildingId is required for building-scoped messaging',
      );
    }

    if (dto.buildingId) {
      await this.buildingAccessService.assertBuildingInOrg(
        dto.buildingId,
        orgId,
      );

      if (!hasOrgWideMessagingAccess) {
        const assignedBuildingIds =
          await this.messagingRepo.getUserBuildingIdsWithPermission(
            userId,
            orgId,
            ORG_SCOPED_MESSAGING_PERMISSION,
          );

        if (!assignedBuildingIds.includes(dto.buildingId)) {
          throw new ForbiddenException(
            'You do not have permission to message residents in this building',
          );
        }

        const buildingResidentIds =
          await this.messagingRepo.getActiveResidentUserIdsInBuilding(
            dto.buildingId,
          );
        const residentSet = new Set(buildingResidentIds);

        const invalidParticipants = validParticipantIds.filter(
          (id) => !residentSet.has(id) && id !== userId,
        );

        if (invalidParticipants.length > 0) {
          throw new ForbiddenException(
            'Some participants are not residents in this building',
          );
        }
      }
    }

    // Ensure creator is included in participants
    const allParticipantIds = Array.from(
      new Set([userId, ...validParticipantIds]),
    );

    const participantRoleBuckets =
      await this.messagingRepo.getConversationParticipantRoleBuckets(
        allParticipantIds,
        orgId,
      );
    const classification = inferConversationClassification(
      participantRoleBuckets,
    );

    if (!classification) {
      throw new BadRequestException(
        'Conversation participants do not map to a supported conversation relationship',
      );
    }

    return this.createConversationAndNotify(orgId, userId, {
      ...classification,
      buildingId: dto.buildingId,
      participantUserIds: allParticipantIds,
      subject: dto.subject,
      message: dto.message,
    });
  }

  async createResidentConversationWithManagement(
    user: AuthenticatedUser,
    orgId: string,
    dto: CreateResidentManagementConversationDto,
  ) {
    const userId = user.sub;
    const { buildingId, participantUserIds } =
      await this.resolveResidentManagementParticipants(userId, orgId, dto);

    if (participantUserIds.length === 0) {
      throw new ConflictException(
        'No management users are assigned to this building',
      );
    }

    return this.createConversationAndNotify(orgId, userId, {
      type: ConversationType.MANAGEMENT_TENANT,
      counterpartyGroup: getCounterpartyGroupForConversationType(
        ConversationType.MANAGEMENT_TENANT,
      ),
      buildingId,
      participantUserIds: [userId, ...participantUserIds],
      subject: dto.subject,
      message: dto.message,
    });
  }

  async listResidentManagementContacts(
    user: AuthenticatedUser,
    orgId: string,
  ): Promise<ManagementContactResponseDto[]> {
    const occupancy = await this.messagingRepo.findActiveOccupancyByResident(
      user.sub,
      orgId,
    );
    if (!occupancy) {
      throw new ConflictException(
        'Resident must have an active occupancy to message management',
      );
    }

    return this.messagingRepo.listManagementUsersForBuilding(
      occupancy.buildingId,
      orgId,
    );
  }

  async createResidentConversationWithOwner(
    user: AuthenticatedUser,
    orgId: string,
    dto: CreateResidentOwnerConversationDto,
  ) {
    const userId = user.sub;
    const occupancy = await this.messagingRepo.findActiveOccupancyByResident(
      userId,
      orgId,
    );
    if (!occupancy) {
      throw new ConflictException(
        'Resident must have an active occupancy to message the unit owner',
      );
    }

    const ownerUserIds = await this.messagingRepo.getActiveOwnerUserIdsForUnit(
      occupancy.unitId,
      orgId,
    );
    const participantUserIds = Array.from(
      new Set(ownerUserIds.filter((id) => id !== userId)),
    );
    if (participantUserIds.length === 0) {
      throw new ConflictException(
        'No active owner user is assigned to this unit',
      );
    }

    return this.createConversationAndNotify(orgId, userId, {
      type: ConversationType.OWNER_TENANT,
      counterpartyGroup: getCounterpartyGroupForConversationType(
        ConversationType.OWNER_TENANT,
      ),
      buildingId: occupancy.buildingId,
      participantUserIds: [userId, ...participantUserIds],
      subject: dto.subject,
      message: dto.message,
    });
  }

  async createOwnerConversationWithManagement(
    user: AuthenticatedUser,
    dto: CreateOwnerManagementConversationDto,
  ) {
    const unit = await this.ownerPortfolioScopeService.getAccessibleUnitOrThrow(
      user.sub,
      dto.unitId,
    );

    const managementUserIds =
      await this.messagingRepo.getManagementUserIdsForBuilding(
        unit.buildingId,
        unit.orgId,
      );
    const participantUserIds = Array.from(
      new Set(managementUserIds.filter((id) => id !== user.sub)),
    );
    if (participantUserIds.length === 0) {
      throw new ConflictException(
        'No management users are assigned to this building',
      );
    }

    return this.createConversationAndNotify(unit.orgId, user.sub, {
      type: ConversationType.MANAGEMENT_OWNER,
      counterpartyGroup: getCounterpartyGroupForConversationType(
        ConversationType.MANAGEMENT_OWNER,
      ),
      buildingId: unit.buildingId,
      participantUserIds: [user.sub, ...participantUserIds],
      subject: dto.subject,
      message: dto.message,
    });
  }

  async createOwnerConversationWithTenant(
    user: AuthenticatedUser,
    dto: CreateOwnerTenantConversationDto,
  ) {
    const unit = await this.ownerPortfolioScopeService.getAccessibleUnitOrThrow(
      user.sub,
      dto.unitId,
    );
    const occupancy =
      await this.messagingRepo.findActiveOccupancyForResidentInUnit(
        dto.tenantUserId,
        dto.unitId,
      );

    if (!occupancy) {
      throw new ForbiddenException(
        'Tenant is not an active resident of this unit',
      );
    }

    return this.createConversationAndNotify(unit.orgId, user.sub, {
      type: ConversationType.OWNER_TENANT,
      counterpartyGroup: getCounterpartyGroupForConversationType(
        ConversationType.OWNER_TENANT,
      ),
      buildingId: unit.buildingId,
      participantUserIds: [user.sub, dto.tenantUserId],
      subject: dto.subject,
      message: dto.message,
    });
  }

  async getConversation(
    user: AuthenticatedUser,
    orgId: string,
    conversationId: string,
  ) {
    const userId = user.sub;
    await this.assertOrgConversationAccess(userId, orgId);

    const conversation = await this.messagingRepo.findConversationByIdForUser(
      conversationId,
      userId,
      orgId,
    );

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async listConversations(
    user: AuthenticatedUser,
    orgId: string,
    options: {
      cursor?: string;
      limit?: number;
      type?: ConversationType;
      counterpartyGroup?: ConversationCounterpartyGroup;
    },
  ) {
    const userId = user.sub;
    await this.assertOrgConversationAccess(userId, orgId);
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const cursorInfo = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;

    const items = await this.messagingRepo.listConversationsForUser(
      userId,
      orgId,
      {
        counterpartyGroup: options.counterpartyGroup,
        type: options.type,
        take: limit + 1,
        cursor: cursorInfo,
      },
    );

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  async getOwnerConversation(user: AuthenticatedUser, conversationId: string) {
    const conversation =
      await this.messagingRepo.findConversationByIdForUserAcrossOrgs(
        conversationId,
        user.sub,
      );

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async listOwnerConversations(
    user: AuthenticatedUser,
    options: {
      cursor?: string;
      limit?: number;
      type?: ConversationType;
      counterpartyGroup?: ConversationCounterpartyGroup;
    },
  ) {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const cursorInfo = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;

    const items = await this.messagingRepo.listConversationsForUserAcrossOrgs(
      user.sub,
      {
        counterpartyGroup: options.counterpartyGroup,
        type: options.type,
        take: limit + 1,
        cursor: cursorInfo,
      },
    );

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  async countUnreadMessages(user: AuthenticatedUser, orgId: string) {
    await this.assertOrgConversationAccess(user.sub, orgId);
    return this.messagingRepo.countUnreadMessagesForUser(user.sub, orgId);
  }

  async countUnreadOwnerMessages(user: AuthenticatedUser) {
    return this.messagingRepo.countUnreadMessagesForUserAcrossOrgs(user.sub);
  }

  async sendMessage(
    user: AuthenticatedUser,
    orgId: string,
    conversationId: string,
    content: string,
  ) {
    const userId = user.sub;
    await this.assertOrgConversationAccess(userId, orgId);

    return this.sendMessageInternal(userId, orgId, conversationId, content);
  }

  async sendOwnerMessage(
    user: AuthenticatedUser,
    conversationId: string,
    content: string,
  ) {
    const conversation =
      await this.messagingRepo.findConversationByIdForUserAcrossOrgs(
        conversationId,
        user.sub,
      );

    if (!conversation) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    return this.sendMessageInternal(
      user.sub,
      conversation.org.id,
      conversationId,
      content,
    );
  }

  async markAsRead(
    user: AuthenticatedUser,
    orgId: string,
    conversationId: string,
  ) {
    const userId = user.sub;
    await this.assertOrgConversationAccess(userId, orgId);

    await this.markConversationAsReadInternal(userId, orgId, conversationId);
  }

  async markOwnerConversationAsRead(
    user: AuthenticatedUser,
    conversationId: string,
  ) {
    const conversation =
      await this.messagingRepo.findConversationByIdForUserAcrossOrgs(
        conversationId,
        user.sub,
      );

    if (!conversation) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    await this.markConversationAsReadInternal(
      user.sub,
      conversation.org.id,
      conversationId,
    );
  }

  private async sendMessageInternal(
    userId: string,
    orgId: string,
    conversationId: string,
    content: string,
  ) {
    // Verify user is a participant
    const isParticipant = await this.messagingRepo.isUserParticipant(
      conversationId,
      userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    // Add message
    const message = await this.messagingRepo.addMessage(
      conversationId,
      userId,
      content,
    );

    // Notify other participants via WebSocket
    const participantIds =
      await this.messagingRepo.getConversationParticipantUserIds(
        conversationId,
      );
    const otherParticipants = participantIds.filter((id) => id !== userId);

    for (const participantId of otherParticipants) {
      this.realtimeService.publishToUser(orgId, participantId, 'message:new', {
        conversationId,
        message: toMessageResponse(message),
      });
    }

    await this.notificationsService.createForUsers({
      orgId,
      userIds: otherParticipants,
      type: NotificationTypeEnum.MESSAGE_CREATED,
      title: this.buildMessageNotificationTitle(message.senderUser.name),
      body: this.summarizePushBody(content),
      data: {
        kind: 'message',
        conversationId,
        messageId: message.id,
        senderUserId: userId,
      },
    });

    this.logger.debug({
      event: 'message:sent',
      conversationId,
      messageId: message.id,
      senderUserId: userId,
    });

    return message;
  }

  private async markConversationAsReadInternal(
    userId: string,
    orgId: string,
    conversationId: string,
  ) {
    // Verify user is a participant
    const isParticipant = await this.messagingRepo.isUserParticipant(
      conversationId,
      userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    await this.messagingRepo.markConversationAsRead(conversationId, userId);

    // Notify via WebSocket that conversation was read
    this.realtimeService.publishToUser(orgId, userId, 'conversation:read', {
      conversationId,
    });
  }

  private encodeCursor(conversation: { id: string; updatedAt: Date }) {
    const value = `${conversation.updatedAt.toISOString()}|${conversation.id}`;
    return Buffer.from(value, 'utf8').toString('base64');
  }

  private decodeCursor(cursor: string) {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    const parts = decoded.split('|');
    if (parts.length !== 2) {
      throw new BadRequestException('Invalid cursor');
    }

    const [updatedAtRaw, id] = parts;
    if (!updatedAtRaw || !id) {
      throw new BadRequestException('Invalid cursor');
    }

    const updatedAt = new Date(updatedAtRaw);
    if (Number.isNaN(updatedAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { updatedAt, id };
  }

  private async createConversationAndNotify(
    orgId: string,
    creatorUserId: string,
    input: {
      type: ConversationType;
      counterpartyGroup: ConversationCounterpartyGroup;
      buildingId?: string | null;
      participantUserIds: string[];
      subject?: string;
      message: string;
    },
  ) {
    const conversation = await this.messagingRepo.createConversation({
      orgId,
      type: input.type,
      counterpartyGroup: input.counterpartyGroup,
      buildingId: input.buildingId,
      subject: input.subject,
      participantUserIds: input.participantUserIds,
      initialMessage: {
        senderUserId: creatorUserId,
        content: input.message,
      },
    });

    const otherParticipants = input.participantUserIds.filter(
      (id) => id !== creatorUserId,
    );
    for (const participantId of otherParticipants) {
      this.realtimeService.publishToUser(
        orgId,
        participantId,
        'conversation:new',
        {
          conversationId: conversation.id,
          subject: conversation.subject,
        },
      );
    }

    const initialMessage = conversation.messages[0];
    await this.notificationsService.createForUsers({
      orgId,
      userIds: otherParticipants,
      type: NotificationTypeEnum.CONVERSATION_CREATED,
      title: this.buildConversationNotificationTitle(
        input.subject,
        initialMessage?.senderUser?.name,
      ),
      body: this.summarizePushBody(initialMessage?.content ?? input.message),
      data: {
        kind: 'conversation',
        conversationId: conversation.id,
        messageId: initialMessage?.id,
        senderUserId: creatorUserId,
      },
    });

    this.logger.log({
      event: 'conversation:created',
      conversationId: conversation.id,
      orgId,
      creatorUserId,
      participantCount: input.participantUserIds.length,
    });

    return conversation;
  }

  private summarizePushBody(content: string) {
    const normalized = content.trim().replace(/\s+/g, ' ');
    if (normalized.length <= 160) {
      return normalized;
    }
    return `${normalized.slice(0, 157)}...`;
  }

  private buildConversationNotificationTitle(
    subject?: string | null,
    senderName?: string | null,
  ) {
    const trimmedSubject = subject?.trim();
    if (trimmedSubject) {
      return trimmedSubject;
    }
    if (senderName) {
      return `New conversation from ${senderName}`;
    }
    return 'New conversation';
  }

  private buildMessageNotificationTitle(senderName?: string | null) {
    if (senderName) {
      return `New message from ${senderName}`;
    }
    return 'New message';
  }

  private async resolveResidentManagementParticipants(
    userId: string,
    orgId: string,
    dto: CreateResidentManagementConversationDto,
  ) {
    const occupancy = await this.messagingRepo.findActiveOccupancyByResident(
      userId,
      orgId,
    );
    if (!occupancy) {
      throw new ConflictException(
        'Resident must have an active occupancy to message management',
      );
    }

    const managementContacts =
      await this.messagingRepo.listManagementUsersForBuilding(
        occupancy.buildingId,
        orgId,
      );

    let participantUserIds = managementContacts
      .map((contact) => contact.id)
      .filter((id) => id !== userId);

    if (dto.managementUserId) {
      const selectedContact = participantUserIds.includes(dto.managementUserId);
      if (!selectedContact) {
        throw new ForbiddenException(
          'Selected management user is not assigned to this building',
        );
      }
      participantUserIds = [dto.managementUserId];
    }

    return {
      buildingId: occupancy.buildingId,
      participantUserIds,
    };
  }

  private async assertOrgConversationAccess(userId: string, orgId: string) {
    const hasElevatedAuthority = await this.hasElevatedMessagingAuthority(
      userId,
      orgId,
    );
    if (hasElevatedAuthority) {
      return;
    }

    const occupancy = await this.messagingRepo.findActiveOccupancyByResident(
      userId,
      orgId,
    );
    if (!occupancy) {
      const hasOccupancyHistory =
        await this.messagingRepo.hasOccupancyHistoryByResident(userId, orgId);
      if (hasOccupancyHistory) {
        throw new ForbiddenException('Active occupancy required');
      }
    }
  }

  private async hasElevatedMessagingAuthority(userId: string, orgId: string) {
    const [orgScopedAccess, buildingIds] = await Promise.all([
      this.accessControlService.getUserScopedAssignments(userId, { orgId }),
      this.messagingRepo.getUserBuildingIdsWithPermission(
        userId,
        orgId,
        ORG_SCOPED_MESSAGING_PERMISSION,
      ),
    ]);

    if (
      orgScopedAccess.rolePermissionKeys.includes(
        ORG_SCOPED_MESSAGING_PERMISSION,
      )
    ) {
      return true;
    }

    return buildingIds.length > 0;
  }
}

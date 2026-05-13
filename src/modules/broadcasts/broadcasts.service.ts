import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { BroadcastsRepo } from './broadcasts.repo';
import { BuildingAccessService } from '../../common/building-access/building-access.service';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import {
  BroadcastAudience,
  DEFAULT_BROADCAST_AUDIENCES,
} from './broadcasts.constants';
import { buildBroadcastMetadata } from './dto/broadcast-metadata.dto';
import { BroadcastDeliveryService } from './broadcast-delivery.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ORG_SCOPED_BROADCAST_PERMISSION = 'broadcasts.write';

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly broadcastsRepo: BroadcastsRepo,
    private readonly buildingAccessService: BuildingAccessService,
    private readonly accessControlService: AccessControlService,
    private readonly broadcastDeliveryService: BroadcastDeliveryService,
  ) {}

  async createBroadcast(
    user: AuthenticatedUser,
    orgId: string,
    dto: CreateBroadcastDto,
  ) {
    const userId = user.sub;
    const audiences = this.normalizeAudiences(dto.audiences);

    // Org-only permission resolution distinguishes org-scoped authority from
    // building-scoped broadcaster access.
    const effectivePermissions =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
      });
    const hasOrgWideBroadcastAccess = effectivePermissions.has(
      ORG_SCOPED_BROADCAST_PERMISSION,
    );
    let orgBuildingIds: string[] | null = null;

    // Resolve target buildings
    let targetBuildingIds: string[];

    if (dto.buildingIds && dto.buildingIds.length > 0) {
      // User specified buildings - validate access
      targetBuildingIds = dto.buildingIds;

      if (hasOrgWideBroadcastAccess) {
        // Org-scoped broadcasters can target any building in the org.
        orgBuildingIds = await this.broadcastsRepo.getOrgBuildingIds(orgId);
        for (const buildingId of targetBuildingIds) {
          await this.buildingAccessService.assertBuildingInOrg(
            buildingId,
            orgId,
          );
        }
      } else {
        // Building-scoped broadcasters can only target buildings where they
        // hold the required broadcast permission.
        const assignedBuildingIds =
          await this.broadcastsRepo.getUserBuildingIdsWithPermission(
            userId,
            orgId,
            ORG_SCOPED_BROADCAST_PERMISSION,
          );
        const assignedSet = new Set(assignedBuildingIds);

        for (const buildingId of targetBuildingIds) {
          await this.buildingAccessService.assertBuildingInOrg(
            buildingId,
            orgId,
          );
          if (!assignedSet.has(buildingId)) {
            throw new ForbiddenException(
              `You do not have permission to broadcast to building ${buildingId}`,
            );
          }
        }
      }
    } else {
      if (hasOrgWideBroadcastAccess) {
        // Org-scoped broadcasters default to all org buildings.
        orgBuildingIds = await this.broadcastsRepo.getOrgBuildingIds(orgId);
        targetBuildingIds = orgBuildingIds;
      } else {
        // Building-scoped broadcasters default to the buildings where they
        // hold broadcast permission.
        targetBuildingIds =
          await this.broadcastsRepo.getUserBuildingIdsWithPermission(
            userId,
            orgId,
            ORG_SCOPED_BROADCAST_PERMISSION,
          );
      }

      if (targetBuildingIds.length === 0) {
        throw new BadRequestException(
          'No buildings available for broadcasting',
        );
      }
    }

    const metadata = buildBroadcastMetadata({
      audiences,
      buildingCount: targetBuildingIds.length,
      isOrgWide:
        hasOrgWideBroadcastAccess &&
        this.matchesOrgWideTarget(
          targetBuildingIds,
          orgBuildingIds ??
            (hasOrgWideBroadcastAccess
              ? await this.broadcastsRepo.getOrgBuildingIds(orgId)
              : []),
        ),
    });

    // Resolve recipient user IDs (active residents in target buildings)
    const recipientUserIds = await this.resolveRecipientUserIds(
      orgId,
      targetBuildingIds,
      audiences,
    );

    if (recipientUserIds.length === 0) {
      throw new BadRequestException(
        'No active recipients found for the selected audiences in the target buildings',
      );
    }

    // Create broadcast record
    const broadcast = await this.broadcastsRepo.create({
      orgId,
      senderUserId: userId,
      title: dto.title,
      body: dto.body,
      buildingIds: targetBuildingIds,
      recipientCount: recipientUserIds.length,
      metadata,
    });

    await this.broadcastDeliveryService.enqueueFanout({
      broadcastId: broadcast.id,
      orgId,
      userIds: recipientUserIds,
      title: dto.title,
      body: dto.body,
      senderUserId: userId,
      buildingIds: targetBuildingIds,
      metadata: {
        broadcastId: broadcast.id,
        buildingIds: targetBuildingIds,
        senderUserId: userId,
        metadata,
      },
    });

    this.logger.log({
      event: 'broadcast:created',
      broadcastId: broadcast.id,
      orgId,
      senderUserId: userId,
      recipientCount: recipientUserIds.length,
      buildingCount: targetBuildingIds.length,
    });

    return broadcast;
  }

  async getBroadcast(
    user: AuthenticatedUser,
    orgId: string,
    broadcastId: string,
  ) {
    const broadcast = await this.broadcastsRepo.findById(broadcastId, orgId);
    if (!broadcast) {
      throw new NotFoundException('Broadcast not found');
    }
    await this.assertReadableByUser(user.sub, orgId, broadcast.buildingIds);
    return broadcast;
  }

  async listBroadcasts(
    user: AuthenticatedUser,
    orgId: string,
    options: { buildingId?: string; cursor?: string; limit?: number },
  ) {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const cursorInfo = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;

    const readableBuildingIds = await this.resolveReadableBuildingIds(
      user.sub,
      orgId,
    );
    const buildingFilter = await this.resolveListBuildingFilter(
      orgId,
      options.buildingId,
      readableBuildingIds,
    );

    const items = await this.broadcastsRepo.list(orgId, {
      buildingId: buildingFilter.singleBuildingId,
      buildingIds: buildingFilter.buildingIds,
      take: limit + 1,
      cursor: cursorInfo,
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeCursor(sliced[sliced.length - 1])
      : undefined;

    return { items: sliced, nextCursor };
  }

  private encodeCursor(broadcast: { id: string; createdAt: Date }) {
    const value = `${broadcast.createdAt.toISOString()}|${broadcast.id}`;
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

    const [createdAtRaw, id] = parts;
    if (!createdAtRaw || !id) {
      throw new BadRequestException('Invalid cursor');
    }

    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { createdAt, id };
  }

  private normalizeAudiences(audiences?: BroadcastAudience[]) {
    const selected =
      audiences && audiences.length > 0
        ? audiences
        : DEFAULT_BROADCAST_AUDIENCES;
    return Array.from(new Set(selected));
  }

  private async resolveReadableBuildingIds(userId: string, orgId: string) {
    const effectivePermissions =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
      });

    if (effectivePermissions.has('broadcasts.read')) {
      return null;
    }

    return this.broadcastsRepo.getUserBuildingIdsWithPermission(
      userId,
      orgId,
      'broadcasts.read',
    );
  }

  private async resolveListBuildingFilter(
    orgId: string,
    requestedBuildingId: string | undefined,
    readableBuildingIds: string[] | null,
  ) {
    if (requestedBuildingId) {
      await this.buildingAccessService.assertBuildingInOrg(
        requestedBuildingId,
        orgId,
      );

      if (
        readableBuildingIds !== null &&
        !readableBuildingIds.includes(requestedBuildingId)
      ) {
        throw new ForbiddenException(
          `You do not have permission to read broadcasts for building ${requestedBuildingId}`,
        );
      }

      return {
        singleBuildingId: requestedBuildingId,
        buildingIds: undefined,
      };
    }

    return {
      singleBuildingId: undefined,
      buildingIds: readableBuildingIds ?? undefined,
    };
  }

  private async assertReadableByUser(
    userId: string,
    orgId: string,
    broadcastBuildingIds: string[],
  ) {
    const readableBuildingIds = await this.resolveReadableBuildingIds(
      userId,
      orgId,
    );

    if (readableBuildingIds === null) {
      return;
    }

    if (
      !broadcastBuildingIds.some((buildingId) =>
        readableBuildingIds.includes(buildingId),
      )
    ) {
      throw new NotFoundException('Broadcast not found');
    }
  }

  private async resolveRecipientUserIds(
    orgId: string,
    buildingIds: string[],
    audiences: BroadcastAudience[],
  ) {
    const audienceSet = new Set(audiences);
    const recipients = new Set<string>();

    let cachedResidentIds: string[] | undefined;
    let cachedAssignmentIdsAllTypes: string[] | undefined;

    const loadResidentIds = async () => {
      if (!cachedResidentIds) {
        cachedResidentIds = await this.broadcastsRepo.getActiveResidentUserIds(
          orgId,
          buildingIds,
        );
      }
      return cachedResidentIds;
    };

    const loadAllAssignmentIds = async () => {
      if (!cachedAssignmentIdsAllTypes) {
        cachedAssignmentIdsAllTypes =
          await this.broadcastsRepo.getBuildingAssignmentUserIds(
            orgId,
            buildingIds,
            ['building_manager', 'building_staff', 'building_admin'],
          );
      }
      return cachedAssignmentIdsAllTypes;
    };

    const loadBuildingLinkedIds = async () => {
      const [residentIds, assignmentIds] = await Promise.all([
        loadResidentIds(),
        loadAllAssignmentIds(),
      ]);
      return Array.from(new Set([...residentIds, ...assignmentIds]));
    };

    if (audienceSet.has(BroadcastAudience.ALL_USERS)) {
      const ids =
        buildingIds.length > 0
          ? await loadBuildingLinkedIds()
          : await this.broadcastsRepo.getActiveOrgUserIds(orgId);
      return ids;
    }

    if (audienceSet.has(BroadcastAudience.TENANTS)) {
      const ids = await loadResidentIds();
      ids.forEach((id) => recipients.add(id));
    }

    const assignmentTypes: string[] = [];
    if (audienceSet.has(BroadcastAudience.MANAGERS)) {
      assignmentTypes.push('building_manager');
    }
    if (audienceSet.has(BroadcastAudience.STAFF)) {
      assignmentTypes.push('building_staff');
    }
    if (audienceSet.has(BroadcastAudience.BUILDING_ADMINS)) {
      assignmentTypes.push('building_admin');
    }
    if (assignmentTypes.length > 0) {
      const ids = await this.broadcastsRepo.getBuildingAssignmentUserIds(
        orgId,
        buildingIds,
        assignmentTypes,
      );
      ids.forEach((id) => recipients.add(id));
    }

    if (audienceSet.has(BroadcastAudience.ADMINS)) {
      const adminIds = await this.broadcastsRepo.getAdminUserIds(orgId);
      if (buildingIds.length === 0) {
        adminIds.forEach((id) => recipients.add(id));
      } else {
        const buildingLinkedIds = await loadBuildingLinkedIds();
        const buildingLinkedSet = new Set(buildingLinkedIds);
        adminIds
          .filter((id) => buildingLinkedSet.has(id))
          .forEach((id) => recipients.add(id));
      }
    }

    return Array.from(recipients);
  }

  private matchesOrgWideTarget(
    targetBuildingIds: string[],
    orgBuildingIds: string[],
  ) {
    if (targetBuildingIds.length === 0 || orgBuildingIds.length === 0) {
      return false;
    }
    if (targetBuildingIds.length !== orgBuildingIds.length) {
      return false;
    }

    const orgSet = new Set(orgBuildingIds);
    return targetBuildingIds.every((buildingId) => orgSet.has(buildingId));
  }
}

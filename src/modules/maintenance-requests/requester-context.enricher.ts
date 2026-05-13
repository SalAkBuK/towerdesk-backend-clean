import { ResidentInviteStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequesterContextResponse } from './dto/requester-context.response.dto';
import {
  UserResidentInviteStatus,
  UserResidentOccupancyStatus,
} from '../users/dto/user.response.dto';

export type RequesterContextSource = {
  requestId: string;
  orgId: string;
  requesterUserId: string;
  unitId?: string | null;
};

const DEFAULT_REQUESTER_CONTEXT: RequesterContextResponse = {
  isResident: false,
  residentOccupancyStatus: null,
  residentInviteStatus: null,
  isFormerResident: false,
  currentUnitOccupiedByRequester: null,
  currentUnitOccupant: null,
};

export const buildRequesterContextMap = async (
  prisma: PrismaService,
  sources: RequesterContextSource[],
): Promise<Map<string, RequesterContextResponse>> => {
  const uniqueSources = dedupeSources(sources);
  const contextByRequestId = new Map<string, RequesterContextResponse>();
  if (uniqueSources.length === 0) {
    return contextByRequestId;
  }

  const orgIds = Array.from(
    new Set(uniqueSources.map((source) => source.orgId)),
  );
  const requesterUserIds = Array.from(
    new Set(uniqueSources.map((source) => source.requesterUserId)),
  );
  const unitIds = Array.from(
    new Set(
      uniqueSources
        .map((source) => source.unitId ?? null)
        .filter((unitId): unitId is string => Boolean(unitId)),
    ),
  );

  const [
    requesterOccupancies,
    residentProfiles,
    residentInvites,
    currentUnitOccupancies,
  ] = await Promise.all([
    prisma.occupancy.findMany({
      where: {
        residentUserId: { in: requesterUserIds },
        building: { orgId: { in: orgIds } },
      },
      select: {
        residentUserId: true,
        status: true,
        createdAt: true,
        id: true,
        building: {
          select: {
            orgId: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.residentProfile.findMany({
      where: {
        orgId: { in: orgIds },
        userId: { in: requesterUserIds },
      },
      select: {
        orgId: true,
        userId: true,
      },
    }),
    prisma.residentInvite.findMany({
      where: {
        orgId: { in: orgIds },
        userId: { in: requesterUserIds },
      },
      select: {
        orgId: true,
        userId: true,
        status: true,
        expiresAt: true,
        sentAt: true,
        id: true,
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    }),
    unitIds.length === 0
      ? Promise.resolve([])
      : prisma.occupancy.findMany({
          where: {
            unitId: { in: unitIds },
            status: 'ACTIVE',
          },
          select: {
            unitId: true,
            residentUserId: true,
            residentUser: {
              select: {
                name: true,
              },
            },
            createdAt: true,
            id: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
  ]);

  const occupancyStateByOrgAndUser = new Map<
    string,
    { hasAnyOccupancy: boolean; hasActiveOccupancy: boolean }
  >();
  for (const occupancy of requesterOccupancies) {
    const key = toOrgUserKey(
      occupancy.building.orgId,
      occupancy.residentUserId,
    );
    const current = occupancyStateByOrgAndUser.get(key) ?? {
      hasAnyOccupancy: false,
      hasActiveOccupancy: false,
    };
    current.hasAnyOccupancy = true;
    if (occupancy.status === 'ACTIVE') {
      current.hasActiveOccupancy = true;
    }
    occupancyStateByOrgAndUser.set(key, current);
  }

  const residentProfileKeys = new Set(
    residentProfiles.map((profile) =>
      toOrgUserKey(profile.orgId, profile.userId),
    ),
  );

  const latestInviteByOrgAndUser = new Map<
    string,
    { status: ResidentInviteStatus; expiresAt: Date }
  >();
  for (const invite of residentInvites) {
    const key = toOrgUserKey(invite.orgId, invite.userId);
    if (!latestInviteByOrgAndUser.has(key)) {
      latestInviteByOrgAndUser.set(key, {
        status: invite.status,
        expiresAt: invite.expiresAt,
      });
    }
  }

  const currentOccupancyByUnitId = new Map<
    string,
    { residentUserId: string; residentUser: { name: string | null } }
  >();
  for (const occupancy of currentUnitOccupancies) {
    if (!currentOccupancyByUnitId.has(occupancy.unitId)) {
      currentOccupancyByUnitId.set(occupancy.unitId, {
        residentUserId: occupancy.residentUserId,
        residentUser: occupancy.residentUser,
      });
    }
  }

  for (const source of uniqueSources) {
    const key = toOrgUserKey(source.orgId, source.requesterUserId);
    const occupancyState = occupancyStateByOrgAndUser.get(key);
    const latestInvite = latestInviteByOrgAndUser.get(key) ?? null;
    const hasResidentProfile = residentProfileKeys.has(key);
    const isResident =
      Boolean(occupancyState?.hasAnyOccupancy) ||
      hasResidentProfile ||
      Boolean(latestInvite);

    const residentOccupancyStatus: UserResidentOccupancyStatus | null =
      !isResident
        ? null
        : occupancyState?.hasActiveOccupancy
          ? 'ACTIVE'
          : occupancyState?.hasAnyOccupancy
            ? 'FORMER'
            : 'NONE';

    const currentUnitOccupancy = source.unitId
      ? (currentOccupancyByUnitId.get(source.unitId) ?? null)
      : null;
    const currentUnitOccupiedByRequester =
      source.unitId && currentUnitOccupancy
        ? currentUnitOccupancy.residentUserId === source.requesterUserId
        : null;

    contextByRequestId.set(source.requestId, {
      isResident,
      residentOccupancyStatus,
      residentInviteStatus: toResidentInviteStatus(latestInvite),
      isFormerResident: residentOccupancyStatus === 'FORMER',
      currentUnitOccupiedByRequester,
      currentUnitOccupant: currentUnitOccupancy
        ? {
            userId: currentUnitOccupancy.residentUserId,
            name: currentUnitOccupancy.residentUser.name ?? null,
          }
        : null,
    });
  }

  return contextByRequestId;
};

export const getRequesterContextOrDefault = (
  contextByRequestId: Map<string, RequesterContextResponse>,
  requestId: string,
): RequesterContextResponse =>
  contextByRequestId.get(requestId) ?? DEFAULT_REQUESTER_CONTEXT;

const dedupeSources = (sources: RequesterContextSource[]) => {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.requestId)) {
      return false;
    }
    seen.add(source.requestId);
    return true;
  });
};

const toOrgUserKey = (orgId: string, userId: string) => `${orgId}:${userId}`;

const toResidentInviteStatus = (
  invite: { status: ResidentInviteStatus; expiresAt: Date } | null,
): UserResidentInviteStatus | null => {
  if (!invite) {
    return null;
  }

  if (invite.status === ResidentInviteStatus.ACCEPTED) {
    return 'ACCEPTED';
  }
  if (invite.status === ResidentInviteStatus.FAILED) {
    return 'FAILED';
  }

  return invite.expiresAt.getTime() > Date.now() ? 'PENDING' : 'EXPIRED';
};

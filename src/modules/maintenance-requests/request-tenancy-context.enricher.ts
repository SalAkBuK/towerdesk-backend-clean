import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  RequestLeaseContextLabel,
  RequestLeaseContextSource as RequestLeaseContextSourceValue,
  RequestTenancyContextLabel,
  RequestTenancyContextSource as RequestTenancyContextSourceValue,
  RequestTenancyContextResponse,
} from './dto/request-tenancy-context.response.dto';

export type RequestTenancyContextSource = {
  requestId: string;
  orgId: string;
  requesterUserId: string;
  createdAt: Date;
  buildingId?: string | null;
  unitId?: string | null;
  occupancyIdAtCreation?: string | null;
  leaseIdAtCreation?: string | null;
};

const DEFAULT_TENANCY_CONTEXT: RequestTenancyContextResponse = {
  occupancyIdAtCreation: null,
  leaseIdAtCreation: null,
  currentOccupancyId: null,
  currentLeaseId: null,
  isCurrentOccupancy: null,
  isCurrentLease: null,
  label: 'UNKNOWN_TENANCY_CYCLE',
  leaseLabel: 'UNKNOWN_LEASE_CYCLE',
  tenancyContextSource: 'UNRESOLVED',
  leaseContextSource: 'UNRESOLVED',
};

export const buildRequestTenancyContextMap = async (
  prisma: PrismaService,
  sources: RequestTenancyContextSource[],
): Promise<Map<string, RequestTenancyContextResponse>> => {
  const uniqueSources = dedupeSources(sources);
  const contextByRequestId = new Map<string, RequestTenancyContextResponse>();
  if (uniqueSources.length === 0) {
    return contextByRequestId;
  }

  const orgIds = Array.from(
    new Set(uniqueSources.map((source) => source.orgId)),
  );
  const requesterUserIds = Array.from(
    new Set(uniqueSources.map((source) => source.requesterUserId)),
  );

  const occupancyHistory = await prisma.occupancy.findMany({
    where: {
      residentUserId: { in: requesterUserIds },
      building: {
        orgId: { in: orgIds },
      },
    },
    select: {
      id: true,
      residentUserId: true,
      buildingId: true,
      unitId: true,
      status: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      building: {
        select: {
          orgId: true,
        },
      },
    },
    orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });

  const currentOccupancyIdByOrgAndUser = new Map<string, string>();
  const occupanciesByOrgAndUser = new Map<string, typeof occupancyHistory>();
  for (const occupancy of occupancyHistory) {
    const key = toOrgUserKey(
      occupancy.building.orgId,
      occupancy.residentUserId,
    );
    const history = occupanciesByOrgAndUser.get(key) ?? [];
    history.push(occupancy);
    occupanciesByOrgAndUser.set(key, history);

    if (
      occupancy.status === 'ACTIVE' &&
      !currentOccupancyIdByOrgAndUser.has(key)
    ) {
      currentOccupancyIdByOrgAndUser.set(key, occupancy.id);
    }
  }

  const leaseHistory = await prisma.lease.findMany({
    where: {
      residentUserId: { in: requesterUserIds },
      orgId: { in: orgIds },
      status: { not: 'DRAFT' },
    },
    select: {
      id: true,
      orgId: true,
      residentUserId: true,
      buildingId: true,
      unitId: true,
      occupancyId: true,
      status: true,
      leaseStartDate: true,
      leaseEndDate: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [
      { leaseStartDate: 'desc' },
      { updatedAt: 'desc' },
      { id: 'desc' },
    ],
  });

  const currentLeaseIdByOrgAndUser = new Map<string, string>();
  const leasesByOrgAndUser = new Map<string, typeof leaseHistory>();
  for (const lease of leaseHistory) {
    if (!lease.residentUserId) {
      continue;
    }
    const key = toOrgUserKey(lease.orgId, lease.residentUserId);
    const history = leasesByOrgAndUser.get(key) ?? [];
    history.push(lease);
    leasesByOrgAndUser.set(key, history);

    if (lease.status === 'ACTIVE' && !currentLeaseIdByOrgAndUser.has(key)) {
      currentLeaseIdByOrgAndUser.set(key, lease.id);
    }
  }

  for (const source of uniqueSources) {
    const orgUserKey = toOrgUserKey(source.orgId, source.requesterUserId);
    const currentOccupancyId =
      currentOccupancyIdByOrgAndUser.get(orgUserKey) ?? null;
    const occupancyIdAtCreation =
      source.occupancyIdAtCreation ??
      inferOccupancyIdAtCreation(
        source,
        occupanciesByOrgAndUser.get(orgUserKey) ?? [],
      );
    const tenancyContextSource = resolveContextSource(
      source.occupancyIdAtCreation ?? null,
      occupancyIdAtCreation,
    );
    const currentLeaseId = currentLeaseIdByOrgAndUser.get(orgUserKey) ?? null;
    const leaseIdAtCreation =
      source.leaseIdAtCreation ??
      inferLeaseIdAtCreation(
        source,
        leasesByOrgAndUser.get(orgUserKey) ?? [],
        occupancyIdAtCreation,
      );
    const leaseContextSource = resolveLeaseContextSource(
      source.leaseIdAtCreation ?? null,
      leaseIdAtCreation,
    );

    contextByRequestId.set(source.requestId, {
      occupancyIdAtCreation,
      leaseIdAtCreation,
      currentOccupancyId,
      currentLeaseId,
      isCurrentOccupancy:
        occupancyIdAtCreation && currentOccupancyId
          ? occupancyIdAtCreation === currentOccupancyId
          : null,
      isCurrentLease:
        leaseIdAtCreation && currentLeaseId
          ? leaseIdAtCreation === currentLeaseId
          : null,
      label: resolveTenancyLabel(occupancyIdAtCreation, currentOccupancyId),
      leaseLabel: resolveLeaseLabel(leaseIdAtCreation, currentLeaseId),
      tenancyContextSource,
      leaseContextSource,
    });
  }

  return contextByRequestId;
};

export const getRequestTenancyContextOrDefault = (
  contextByRequestId: Map<string, RequestTenancyContextResponse>,
  requestId: string,
): RequestTenancyContextResponse =>
  contextByRequestId.get(requestId) ?? DEFAULT_TENANCY_CONTEXT;

const resolveTenancyLabel = (
  occupancyIdAtCreation: string | null,
  currentOccupancyId: string | null,
): RequestTenancyContextLabel => {
  if (!occupancyIdAtCreation) {
    return 'UNKNOWN_TENANCY_CYCLE';
  }
  if (!currentOccupancyId) {
    return 'NO_ACTIVE_OCCUPANCY';
  }
  return occupancyIdAtCreation === currentOccupancyId
    ? 'CURRENT_OCCUPANCY'
    : 'PREVIOUS_OCCUPANCY';
};

const resolveLeaseLabel = (
  leaseIdAtCreation: string | null,
  currentLeaseId: string | null,
): RequestLeaseContextLabel => {
  if (!leaseIdAtCreation) {
    return 'UNKNOWN_LEASE_CYCLE';
  }
  if (!currentLeaseId) {
    return 'NO_ACTIVE_LEASE';
  }
  return leaseIdAtCreation === currentLeaseId
    ? 'CURRENT_LEASE'
    : 'PREVIOUS_LEASE';
};

const toOrgUserKey = (orgId: string, userId: string) => `${orgId}:${userId}`;

const dedupeSources = (sources: RequestTenancyContextSource[]) => {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.requestId)) {
      return false;
    }
    seen.add(source.requestId);
    return true;
  });
};

const resolveContextSource = (
  snapshotValue: string | null,
  resolvedValue: string | null,
): RequestTenancyContextSourceValue => {
  if (snapshotValue) {
    return 'SNAPSHOT';
  }
  if (resolvedValue) {
    return 'HISTORICAL_INFERENCE';
  }
  return 'UNRESOLVED';
};

const resolveLeaseContextSource = (
  snapshotValue: string | null,
  resolvedValue: string | null,
): RequestLeaseContextSourceValue => {
  if (snapshotValue) {
    return 'SNAPSHOT';
  }
  if (resolvedValue) {
    return 'HISTORICAL_INFERENCE';
  }
  return 'UNRESOLVED';
};

const inferOccupancyIdAtCreation = (
  source: RequestTenancyContextSource,
  occupancies: Array<{
    id: string;
    buildingId: string;
    unitId: string;
    startAt: Date;
    endAt: Date | null;
  }>,
) => {
  const matches = occupancies.filter((occupancy) => {
    if (source.buildingId && occupancy.buildingId !== source.buildingId) {
      return false;
    }
    if (source.unitId && occupancy.unitId !== source.unitId) {
      return false;
    }
    return isDateWithinRange(
      source.createdAt,
      occupancy.startAt,
      occupancy.endAt,
    );
  });

  return matches.length === 1 ? matches[0].id : null;
};

const inferLeaseIdAtCreation = (
  source: RequestTenancyContextSource,
  leases: Array<{
    id: string;
    buildingId: string;
    unitId: string;
    occupancyId: string | null;
    leaseStartDate: Date;
    leaseEndDate: Date;
  }>,
  occupancyIdAtCreation: string | null,
) => {
  const dateMatches = leases.filter((lease) => {
    if (source.buildingId && lease.buildingId !== source.buildingId) {
      return false;
    }
    if (source.unitId && lease.unitId !== source.unitId) {
      return false;
    }
    return isDateWithinRange(
      source.createdAt,
      lease.leaseStartDate,
      lease.leaseEndDate,
    );
  });

  if (occupancyIdAtCreation) {
    const occupancyMatches = dateMatches.filter(
      (lease) => lease.occupancyId === occupancyIdAtCreation,
    );
    if (occupancyMatches.length === 1) {
      return occupancyMatches[0].id;
    }
    if (occupancyMatches.length > 1) {
      return null;
    }
  }

  return dateMatches.length === 1 ? dateMatches[0].id : null;
};

const isDateWithinRange = (value: Date, start: Date, end: Date | null) => {
  const timestamp = value.getTime();
  return timestamp >= start.getTime() && (!end || timestamp <= end.getTime());
};

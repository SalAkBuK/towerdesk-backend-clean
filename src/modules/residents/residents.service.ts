import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ResidentInviteStatus, ResidentProfile } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { env } from '../../config/env';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { UnitsRepo } from '../units/units.repo';
import { AuthService } from '../auth/auth.service';
import { OrgUserLifecycleService } from '../users/org-user-lifecycle.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { CreateOrgResidentDto } from './dto/create-org-resident.dto';
import {
  ResidentDirectoryQueryDto,
  ResidentDirectoryResponseDto,
  ResidentDirectoryRowDto,
} from './dto/resident-directory.dto';
import {
  ResidentListItemDto,
  toResidentListItem,
} from './dto/resident-list.response.dto';
import {
  LastOccupancyDto,
  ListOrgResidentsQueryDto,
  OrgResidentListResponseDto,
  ResidentListStatus,
  ResidentStatusCategory,
} from './dto/list-org-residents.dto';
import {
  ListResidentInvitesQueryDto,
  ResidentInviteListResponseDto,
  ResidentInviteRowDto,
  ResidentInviteStatusFilter,
} from './dto/list-resident-invites.dto';

@Injectable()
export class ResidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buildingsRepo: BuildingsRepo,
    private readonly unitsRepo: UnitsRepo,
    private readonly authService: AuthService,
    private readonly orgUserLifecycleService: OrgUserLifecycleService,
  ) {}

  async onboard(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: CreateResidentDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const unit = await this.unitsRepo.findByIdForBuilding(
      buildingId,
      dto.unitId,
    );
    if (!unit) {
      throw new BadRequestException('Unit not in building');
    }

    const sendInvite = dto.sendInvite !== false;
    const provisioned = await this.orgUserLifecycleService.provisionOrgUser({
      actor: user,
      orgId,
      identity: {
        email: dto.email,
        name: dto.name,
        phone: dto.phone ?? null,
        password: dto.password,
        sendInvite,
      },
      resident: {
        buildingId,
        unitId: unit.id,
        mode: 'ADD',
      },
      allowGeneratedPasswordWithoutInvite: true,
      invitePurpose: 'RESIDENT_INVITE',
      mode: { ifEmailExists: 'ERROR', requireSameOrg: true },
      enforceActorProvisioningRules: false,
      ensureResidentBaselinePermissions: true,
    });

    return {
      userId: provisioned.user.id,
      name: provisioned.user.name ?? dto.name,
      email: provisioned.user.email,
      phone: provisioned.user.phone ?? null,
      unit: { id: unit.id, label: unit.label },
      buildingId,
      tempPassword: provisioned.generatedPassword,
      inviteSent: sendInvite,
      mustChangePassword: true,
    };
  }

  async list(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    status: 'ACTIVE' | 'ENDED' | 'ALL' = 'ACTIVE',
    includeUnassigned = false,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const occupancies = await this.prisma.occupancy.findMany({
      where: {
        buildingId,
        ...(status === 'ALL' ? {} : { status }),
      },
      include: {
        unit: true,
        residentUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows: ResidentListItemDto[] = occupancies.map(toResidentListItem);

    if (!includeUnassigned) {
      return rows;
    }

    const unassigned = await this.prisma.user.findMany({
      where: {
        orgId,
        residentOccupancies: { none: { status: 'ACTIVE' } },
        residentProfile: { preferredBuildingId: buildingId },
      },
      include: {
        residentProfile: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const userRecord of unassigned) {
      rows.push({
        userId: userRecord.id,
        name: userRecord.name ?? null,
        email: userRecord.email,
        unit: null,
        status: 'NO_OCCUPANCY',
        startAt: null,
        endAt: null,
      });
    }

    return rows;
  }

  async createResidentInOrg(
    user: AuthenticatedUser | undefined,
    dto: CreateOrgResidentDto,
  ) {
    const orgId = assertOrgScope(user);
    if (dto.profile?.preferredBuildingId) {
      const building = await this.buildingsRepo.findByIdForOrg(
        orgId,
        dto.profile.preferredBuildingId,
      );
      if (!building) {
        throw new BadRequestException('Preferred building not in org');
      }
    }

    const sendInvite = dto.user.sendInvite !== false;
    const created = await this.orgUserLifecycleService.provisionOrgUser({
      actor: user,
      orgId,
      identity: {
        email: dto.user.email,
        name: dto.user.name,
        phone: dto.user.phone?.trim() ?? null,
        password: dto.user.password,
        sendInvite,
      },
      allowGeneratedPasswordWithoutInvite: true,
      invitePurpose: 'RESIDENT_INVITE',
      mode: { ifEmailExists: 'ERROR', requireSameOrg: true },
      enforceActorProvisioningRules: false,
      ensureResidentBaselinePermissions: true,
    });

    if (dto.profile) {
      await this.prisma.residentProfile.upsert({
        where: { userId: created.user.id },
        update: {
          ...(dto.profile.emiratesIdNumber !== undefined
            ? { emiratesIdNumber: dto.profile.emiratesIdNumber }
            : {}),
          ...(dto.profile.passportNumber !== undefined
            ? { passportNumber: dto.profile.passportNumber }
            : {}),
          ...(dto.profile.nationality !== undefined
            ? { nationality: dto.profile.nationality }
            : {}),
          ...(dto.profile.dateOfBirth !== undefined
            ? { dateOfBirth: new Date(dto.profile.dateOfBirth) }
            : {}),
          ...(dto.profile.currentAddress !== undefined
            ? { currentAddress: dto.profile.currentAddress }
            : {}),
          ...(dto.profile.emergencyContactName !== undefined
            ? { emergencyContactName: dto.profile.emergencyContactName }
            : {}),
          ...(dto.profile.emergencyContactPhone !== undefined
            ? { emergencyContactPhone: dto.profile.emergencyContactPhone }
            : {}),
          ...(dto.profile.preferredBuildingId !== undefined
            ? { preferredBuildingId: dto.profile.preferredBuildingId }
            : {}),
        },
        create: {
          orgId,
          userId: created.user.id,
          emiratesIdNumber: dto.profile.emiratesIdNumber ?? null,
          passportNumber: dto.profile.passportNumber ?? null,
          nationality: dto.profile.nationality ?? null,
          dateOfBirth: dto.profile.dateOfBirth
            ? new Date(dto.profile.dateOfBirth)
            : null,
          currentAddress: dto.profile.currentAddress ?? null,
          emergencyContactName: dto.profile.emergencyContactName ?? null,
          emergencyContactPhone: dto.profile.emergencyContactPhone ?? null,
          preferredBuildingId: dto.profile.preferredBuildingId ?? null,
        },
      });
    }

    const profile = await this.prisma.residentProfile.findFirst({
      where: { orgId, userId: created.user.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });
    return {
      user: created.user,
      residentProfile: profile,
      tempPassword: created.generatedPassword,
      inviteSent: sendInvite,
    };
  }

  async sendResidentInvite(
    user: AuthenticatedUser | undefined,
    userId: string,
  ) {
    const orgId = assertOrgScope(user);
    const resident = await this.prisma.user.findFirst({
      where: {
        id: userId,
        orgId,
        isActive: true,
        OR: [
          { residentProfile: { isNot: null } },
          { residentOccupancies: { some: {} } },
          { residentInvitesReceived: { some: {} } },
        ],
      },
      select: { email: true },
    });
    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    const inviteResendCooldownSeconds =
      env.RESIDENT_INVITE_RESEND_COOLDOWN_SECONDS ?? 60;
    if (inviteResendCooldownSeconds > 0) {
      const latestInvite = await this.prisma.residentInvite.findFirst({
        where: {
          orgId,
          userId,
        },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        select: {
          sentAt: true,
        },
      });

      if (latestInvite) {
        const elapsedMs = Date.now() - latestInvite.sentAt.getTime();
        const cooldownMs = inviteResendCooldownSeconds * 1000;
        if (elapsedMs < cooldownMs) {
          const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
          throw new ConflictException(
            `Invite already sent recently. Try again in ${retryAfterSeconds} seconds.`,
          );
        }
      }
    }

    await this.authService.requestPasswordReset(resident.email, {
      purpose: 'RESIDENT_INVITE',
      issuedByUserId: user?.sub ?? null,
    });
    return { success: true };
  }

  async listResidentDirectory(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    query: ResidentDirectoryQueryDto,
  ): Promise<ResidentDirectoryResponseDto> {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const sortField = query.sort ?? 'createdAt';
    const sortOrder = query.order ?? 'desc';
    const includeProfile = query.includeProfile === 'true';

    const where: Record<string, unknown> = { buildingId };
    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { residentUser: { name: { contains: q, mode: 'insensitive' } } },
        { residentUser: { email: { contains: q, mode: 'insensitive' } } },
        { unit: { label: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const cursorInfo = query.cursor
      ? this.decodeDirectoryCursor(query.cursor, sortField)
      : null;
    if (cursorInfo) {
      const op = sortOrder === 'desc' ? 'lt' : 'gt';
      if (sortField === 'residentName') {
        where.AND = [
          {
            OR: [
              { residentUser: { name: { [op]: cursorInfo.value } } },
              {
                AND: [
                  { residentUser: { name: cursorInfo.value } },
                  { id: { [op]: cursorInfo.id } },
                ],
              },
            ],
          },
        ];
      } else if (sortField === 'unitLabel') {
        where.AND = [
          {
            OR: [
              { unit: { label: { [op]: cursorInfo.value } } },
              {
                AND: [
                  { unit: { label: cursorInfo.value } },
                  { id: { [op]: cursorInfo.id } },
                ],
              },
            ],
          },
        ];
      } else {
        where.AND = [
          {
            OR: [
              { [sortField]: { [op]: cursorInfo.value } },
              {
                AND: [
                  { [sortField]: cursorInfo.value },
                  { id: { [op]: cursorInfo.id } },
                ],
              },
            ],
          },
        ];
      }
    }

    const orderBy =
      sortField === 'residentName'
        ? [{ residentUser: { name: sortOrder } }, { id: sortOrder }]
        : sortField === 'unitLabel'
          ? [{ unit: { label: sortOrder } }, { id: sortOrder }]
          : [{ [sortField]: sortOrder }, { id: sortOrder }];

    const items = await this.prisma.occupancy.findMany({
      where,
      orderBy,
      take: limit + 1,
      include: {
        unit: { select: { id: true, label: true } },
        residentUser: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            residentProfile: includeProfile
              ? {
                  select: {
                    emiratesIdNumber: true,
                    passportNumber: true,
                    nationality: true,
                    dateOfBirth: true,
                    currentAddress: true,
                    emergencyContactName: true,
                    emergencyContactPhone: true,
                  },
                }
              : false,
          },
        },
        lease: true,
      },
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? this.encodeDirectoryCursor(sliced[sliced.length - 1], sortField)
      : undefined;

    const residentIds = Array.from(
      new Set(sliced.map((item) => item.residentUserId)),
    );
    const latestContracts = residentIds.length
      ? await this.prisma.lease.findMany({
          where: {
            orgId,
            residentUserId: { in: residentIds },
          },
          select: {
            id: true,
            status: true,
            residentUserId: true,
            leaseStartDate: true,
          },
          orderBy: [{ leaseStartDate: 'desc' }, { id: 'desc' }],
        })
      : [];
    const latestContractByResident = new Map<
      string,
      { id: string; status: string }
    >();
    for (const contract of latestContracts) {
      if (!contract.residentUserId) continue;
      if (!latestContractByResident.has(contract.residentUserId)) {
        latestContractByResident.set(contract.residentUserId, {
          id: contract.id,
          status: contract.status,
        });
      }
    }

    const mapped: ResidentDirectoryRowDto[] = sliced.map((item) => {
      const lease =
        item.lease && item.lease.status === 'ACTIVE' ? item.lease : null;
      const latestContract =
        latestContractByResident.get(item.residentUserId) ??
        (lease ? { id: lease.id, status: lease.status } : null);
      const latestContractId = latestContract?.id ?? null;
      const latestContractStatus = latestContract?.status ?? null;
      const canViewContract = Boolean(latestContractId);
      const canRequestMoveOut = Boolean(
        item.status === 'ACTIVE' &&
        lease &&
        lease.status === 'ACTIVE' &&
        latestContractStatus === 'ACTIVE',
      );

      return {
        occupancyId: item.id,
        residentUserId: item.residentUserId,
        residentName: item.residentUser.name ?? null,
        residentEmail: item.residentUser.email,
        residentPhone: item.residentUser.phone ?? null,
        residentAvatarUrl: item.residentUser.avatarUrl ?? null,
        unitId: item.unitId,
        unitLabel: item.unit.label,
        status: item.status,
        startAt: item.startAt,
        endAt: item.endAt ?? null,
        profile: includeProfile
          ? {
              emiratesIdNumber:
                item.residentUser.residentProfile?.emiratesIdNumber ?? null,
              passportNumber:
                item.residentUser.residentProfile?.passportNumber ?? null,
              nationality:
                item.residentUser.residentProfile?.nationality ?? null,
              dateOfBirth:
                item.residentUser.residentProfile?.dateOfBirth ?? null,
              currentAddress:
                item.residentUser.residentProfile?.currentAddress ?? null,
              emergencyContactName:
                item.residentUser.residentProfile?.emergencyContactName ?? null,
              emergencyContactPhone:
                item.residentUser.residentProfile?.emergencyContactPhone ??
                null,
              preferredBuildingId:
                item.residentUser.residentProfile?.preferredBuildingId ?? null,
            }
          : null,
        lease: lease
          ? {
              leaseId: lease.id,
              status: lease.status,
              leaseStartDate: lease.leaseStartDate,
              leaseEndDate: lease.leaseEndDate,
              annualRent: lease.annualRent?.toString?.() ?? null,
            }
          : null,
        latestContractId,
        canAddContract: true,
        canViewContract,
        canRequestMoveIn: false,
        canRequestMoveOut,
        canExecuteMoveOut: canRequestMoveOut,
      };
    });

    return { items: mapped, nextCursor };
  }

  async listResidentsInOrg(
    user: AuthenticatedUser | undefined,
    query: ListOrgResidentsQueryDto,
  ): Promise<OrgResidentListResponseDto> {
    const orgId = assertOrgScope(user);
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const includeProfile = query.includeProfile === 'true';
    const status: ResidentListStatus = query.status ?? 'ALL';
    const q = query.q?.trim();

    const where: Record<string, unknown> = {
      orgId,
      OR: [
        { residentProfile: { isNot: null } },
        { residentOccupancies: { some: {} } },
        { residentInvitesReceived: { some: {} } },
      ],
    };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (status === 'WITH_OCCUPANCY') {
      where.residentOccupancies = { some: { status: 'ACTIVE' } };
    } else if (status === 'WITHOUT_OCCUPANCY') {
      where.residentOccupancies = { none: { status: 'ACTIVE' } };
    } else if (status === 'NEW') {
      where.residentOccupancies = { none: {} };
    } else if (status === 'FORMER') {
      where.AND = [
        { residentOccupancies: { some: {} } },
        { residentOccupancies: { none: { status: 'ACTIVE' } } },
      ];
    }

    const cursorInfo = query.cursor
      ? this.decodeOrgResidentCursor(query.cursor)
      : null;
    if (cursorInfo) {
      const cursorCondition = {
        OR: [
          { createdAt: { lt: cursorInfo.createdAt } },
          {
            AND: [
              { createdAt: cursorInfo.createdAt },
              { id: { lt: cursorInfo.id } },
            ],
          },
        ],
      };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        cursorCondition,
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        residentProfile: includeProfile,
        residentOccupancies: {
          select: {
            id: true,
            status: true,
            endAt: true,
            building: { select: { name: true } },
            unit: { select: { label: true } },
          },
          orderBy: { endAt: 'desc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = users.length > limit;
    const sliced = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore
      ? this.encodeOrgResidentCursor(sliced[sliced.length - 1])
      : undefined;

    type OccupancyRow = {
      id: string;
      status: string;
      endAt: Date | null;
      building: { name: string } | null;
      unit: { label: string } | null;
    };

    return {
      items: await Promise.all(
        sliced.map(async (userRecord) => {
          const occupancies: OccupancyRow[] =
            (userRecord as { residentOccupancies?: OccupancyRow[] })
              .residentOccupancies ?? [];
          const hasActiveOccupancy = occupancies.some(
            (o) => o.status === 'ACTIVE',
          );

          let residentStatus: ResidentStatusCategory;
          if (hasActiveOccupancy) {
            residentStatus = 'ACTIVE';
          } else if (occupancies.length === 0) {
            residentStatus = 'NEW';
          } else {
            residentStatus = 'FORMER';
          }

          let lastOccupancy: LastOccupancyDto | null = null;
          if (residentStatus === 'FORMER') {
            const lastEnded = occupancies.find((o) => o.status === 'ENDED');
            if (lastEnded) {
              lastOccupancy = {
                buildingName: lastEnded.building?.name ?? '',
                unitLabel: lastEnded.unit?.label ?? '',
                endAt: lastEnded.endAt ?? null,
              };
            }
          }

          return {
            user: await this.orgUserLifecycleService.buildUserResponse(
              userRecord,
              orgId,
            ),
            hasActiveOccupancy,
            residentStatus,
            residentProfile: includeProfile
              ? this.attachUserToProfile(
                  userRecord,
                  (userRecord as { residentProfile?: ResidentProfile | null })
                    .residentProfile ?? null,
                )
              : null,
            lastOccupancy,
          };
        }),
      ),
      nextCursor,
    };
  }

  async listResidentInvitesInOrg(
    user: AuthenticatedUser | undefined,
    query: ListResidentInvitesQueryDto,
  ): Promise<ResidentInviteListResponseDto> {
    const orgId = assertOrgScope(user);
    const now = new Date();
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const status: ResidentInviteStatusFilter = query.status ?? 'ALL';
    const q = query.q?.trim();
    const cursor = query.cursor
      ? this.decodeResidentInviteCursor(query.cursor)
      : null;

    const where: Prisma.ResidentInviteWhereInput = { orgId };
    const and: Prisma.ResidentInviteWhereInput[] = [];

    if (q) {
      and.push({
        OR: [
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    if (status === 'PENDING') {
      and.push(
        { status: ResidentInviteStatus.SENT },
        { expiresAt: { gt: now } },
      );
    } else if (status === 'EXPIRED') {
      and.push(
        { status: ResidentInviteStatus.SENT },
        { expiresAt: { lte: now } },
      );
    } else if (status === 'ACCEPTED') {
      and.push({ status: ResidentInviteStatus.ACCEPTED });
    } else if (status === 'FAILED') {
      and.push({ status: ResidentInviteStatus.FAILED });
    }

    if (cursor) {
      and.push({
        OR: [
          { sentAt: { lt: cursor.sentAt } },
          {
            AND: [{ sentAt: cursor.sentAt }, { id: { lt: cursor.id } }],
          },
        ],
      });
    }
    if (and.length > 0) {
      where.AND = and;
    }

    const rows = await this.prisma.residentInvite.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            mustChangePassword: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? this.encodeResidentInviteCursor(sliced[sliced.length - 1])
      : undefined;

    const items: ResidentInviteRowDto[] = sliced.map((row) => {
      const statusValue: ResidentInviteRowDto['status'] =
        row.status === ResidentInviteStatus.ACCEPTED
          ? 'ACCEPTED'
          : row.status === ResidentInviteStatus.FAILED
            ? 'FAILED'
            : row.expiresAt.getTime() <= now.getTime()
              ? 'EXPIRED'
              : 'PENDING';

      return {
        inviteId: row.id,
        status: statusValue,
        sentAt: row.sentAt,
        expiresAt: row.expiresAt,
        acceptedAt: row.acceptedAt ?? null,
        failedAt: row.failedAt ?? null,
        failureReason: row.failureReason ?? null,
        user: {
          id: row.user.id,
          email: row.user.email,
          name: row.user.name ?? null,
          isActive: row.user.isActive,
          mustChangePassword: row.user.mustChangePassword,
        },
        createdByUser: row.createdByUser
          ? {
              id: row.createdByUser.id,
              email: row.createdByUser.email,
              name: row.createdByUser.name ?? null,
            }
          : null,
      };
    });

    return { items, nextCursor };
  }

  async getCurrentResidentProfile(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const residentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!residentUser || residentUser.orgId !== orgId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const occupancy = await this.prisma.occupancy.findFirst({
      where: {
        residentUserId: userId,
        status: 'ACTIVE',
        building: { orgId },
      },
      include: {
        building: true,
        unit: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { user: residentUser, occupancy };
  }

  private decodeDirectoryCursor(
    cursor: string,
    field: 'createdAt' | 'startAt' | 'residentName' | 'unitLabel',
  ): { id: string; value: string | Date } {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    let payload: { v: string; id: string };
    try {
      payload = JSON.parse(decoded) as { v: string; id: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    if (!payload?.id || payload.v === undefined) {
      throw new BadRequestException('Invalid cursor');
    }
    if (field === 'createdAt' || field === 'startAt') {
      const date = new Date(payload.v);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid cursor');
      }
      return { id: payload.id, value: date };
    }
    return { id: payload.id, value: payload.v };
  }

  private encodeDirectoryCursor(
    item: {
      id: string;
      createdAt: Date;
      startAt: Date;
      residentUser?: { name?: string | null };
      unit?: { label?: string | null };
    },
    field: 'createdAt' | 'startAt' | 'residentName' | 'unitLabel',
  ) {
    let value: string;
    if (field === 'residentName') {
      value = (item.residentUser?.name ?? '').toString();
    } else if (field === 'unitLabel') {
      value = (item.unit?.label ?? '').toString();
    } else if (field === 'startAt') {
      value = item.startAt.toISOString();
    } else {
      value = item.createdAt.toISOString();
    }
    return Buffer.from(JSON.stringify({ v: value, id: item.id })).toString(
      'base64',
    );
  }

  private decodeOrgResidentCursor(cursor: string): {
    id: string;
    createdAt: Date;
  } {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    let payload: { createdAt: string; id: string };
    try {
      payload = JSON.parse(decoded) as { createdAt: string; id: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    if (!payload?.id || !payload.createdAt) {
      throw new BadRequestException('Invalid cursor');
    }
    const createdAt = new Date(payload.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }
    return { id: payload.id, createdAt };
  }

  private encodeOrgResidentCursor(item: { id: string; createdAt: Date }) {
    return Buffer.from(
      JSON.stringify({ createdAt: item.createdAt.toISOString(), id: item.id }),
    ).toString('base64');
  }

  private decodeResidentInviteCursor(cursor: string): {
    id: string;
    sentAt: Date;
  } {
    let decoded: string;
    try {
      decoded = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    let payload: { sentAt: string; id: string };
    try {
      payload = JSON.parse(decoded) as { sentAt: string; id: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    if (!payload?.id || !payload.sentAt) {
      throw new BadRequestException('Invalid cursor');
    }
    const sentAt = new Date(payload.sentAt);
    if (Number.isNaN(sentAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }
    return { id: payload.id, sentAt };
  }

  private encodeResidentInviteCursor(item: { id: string; sentAt: Date }) {
    return Buffer.from(
      JSON.stringify({ sentAt: item.sentAt.toISOString(), id: item.id }),
    ).toString('base64');
  }

  private attachUserToProfile<T extends object>(
    userRecord: {
      id: string;
      email: string;
      name?: string | null;
      phone?: string | null;
      avatarUrl?: string | null;
    },
    profile: T | null,
  ):
    | (T & {
        user: {
          id: string;
          email: string;
          name: string | null;
          phone: string | null;
          avatarUrl: string | null;
        };
      })
    | null {
    if (!profile) {
      return null;
    }

    return {
      ...profile,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name ?? null,
        phone: userRecord.phone ?? null,
        avatarUrl: userRecord.avatarUrl ?? null,
      },
    };
  }
}

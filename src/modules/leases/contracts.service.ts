import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  LeaseActivityAction,
  LeaseDocument,
  LeaseDocumentType,
  LeaseHistoryAction,
  LeaseStatus,
  MoveRequestStatus,
  Prisma as PrismaNamespace,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { hasAllPermissionMatches } from '../../common/utils/permission-aliases';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { AccessControlService } from '../access-control/access-control.service';
import { UnitsRepo } from '../units/units.repo';
import { NotificationTypeEnum } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildLeaseChangeSet,
  buildLeaseCreationChangeSet,
} from './lease-history.util';
import { LeaseHistoryRepo } from './lease-history.repo';
import { LeaseActivityRepo } from './lease-activity.repo';
import { LeaseLifecycleService } from './lease-lifecycle.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { CreateLeaseDocumentDto } from './dto/create-lease-document.dto';
import {
  ListOrgContractsQueryDto,
  OrgContractOrder,
} from './dto/list-org-contracts.query.dto';
import { ListResidentContractsQueryDto } from './dto/list-resident-contracts.query.dto';
import { CreateResidentContractUploadUrlDto } from './dto/resident-contract-upload.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ReplaceContractAdditionalTermsDto } from './dto/replace-contract-additional-terms.dto';
import {
  CreateMoveRequestDto,
  ListMoveRequestsQueryDto,
  RejectMoveRequestDto,
} from './dto/move-request.dto';
import { LeaseDocumentsService } from './lease-documents.service';

const contractInclude = {
  unit: { include: { unitType: true } },
  occupancy: { include: { residentUser: true } },
  residentUser: true,
  additionalTerms: { orderBy: { createdAt: 'asc' as const } },
};

type ContractRecord = PrismaNamespace.LeaseGetPayload<{
  include: typeof contractInclude;
}>;

type ResidentLatestContractSummary = {
  contract: ContractRecord | null;
  canRequestMoveIn: boolean;
  canRequestMoveOut: boolean;
  latestMoveInRequestStatus: MoveRequestStatus | null;
  latestMoveOutRequestStatus: MoveRequestStatus | null;
};

const MOVE_REVIEW_PERMISSION = 'contracts.move_requests.review';
const MOVE_IN_EXECUTE_PERMISSION = 'contracts.move_in.execute';
const MOVE_OUT_EXECUTE_PERMISSION = 'contracts.move_out.execute';

@Injectable()
export class ContractsService {
  private readonly residentContractDocumentUploadExpirySeconds = 900;
  private readonly residentContractDocumentMaxSizeBytes = 15 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly buildingsRepo: BuildingsRepo,
    private readonly unitsRepo: UnitsRepo,
    private readonly leaseHistoryRepo: LeaseHistoryRepo,
    private readonly leaseActivityRepo: LeaseActivityRepo,
    private readonly leaseLifecycleService: LeaseLifecycleService,
    private readonly leaseDocumentsService: LeaseDocumentsService,
    private readonly storageService: StorageService,
    private readonly accessControlService: AccessControlService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createDraftContract(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: CreateContractDto,
  ): Promise<ContractRecord> {
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
    const unitWithType = await this.prisma.unit.findFirst({
      where: { id: unit.id },
      include: { unitType: true },
    });

    const resident = await this.prisma.user.findFirst({
      where: { id: dto.residentUserId, orgId, isActive: true },
    });
    if (!resident) {
      throw new BadRequestException('Resident not found in org');
    }

    const contractPeriodFrom = new Date(dto.contractPeriodFrom);
    const contractPeriodTo = new Date(dto.contractPeriodTo);
    if (contractPeriodTo.getTime() <= contractPeriodFrom.getTime()) {
      throw new BadRequestException(
        'contractPeriodTo must be after contractPeriodFrom',
      );
    }

    const existingActive = await this.prisma.lease.findFirst({
      where: {
        orgId,
        unitId: unit.id,
        status: LeaseStatus.ACTIVE,
      },
    });
    if (existingActive) {
      throw new ConflictException('Unit already has an active contract');
    }

    const additionalTerms = this.normalizeTerms(dto.additionalTerms ?? []);
    const annualRent = new PrismaNamespace.Decimal(dto.annualRent);
    const securityDepositAmount = new PrismaNamespace.Decimal(
      dto.securityDepositAmount,
    );
    const contractValue = dto.contractValue
      ? new PrismaNamespace.Decimal(dto.contractValue)
      : annualRent;

    const created = await this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.create({
        data: {
          orgId,
          buildingId,
          unitId: unit.id,
          occupancyId: null,
          residentUserId: resident.id,
          status: LeaseStatus.DRAFT,
          ijariId: dto.ijariId ?? null,
          contractDate: dto.contractDate ? new Date(dto.contractDate) : null,
          propertyUsage: dto.propertyUsage ?? null,
          ownerNameSnapshot: dto.ownerNameSnapshot ?? null,
          landlordNameSnapshot: dto.landlordNameSnapshot ?? null,
          tenantNameSnapshot: dto.tenantNameSnapshot ?? resident.name ?? null,
          tenantEmailSnapshot: dto.tenantEmailSnapshot ?? resident.email,
          landlordEmailSnapshot: dto.landlordEmailSnapshot ?? null,
          tenantPhoneSnapshot:
            dto.tenantPhoneSnapshot ?? resident.phone ?? null,
          landlordPhoneSnapshot: dto.landlordPhoneSnapshot ?? null,
          buildingNameSnapshot: dto.buildingNameSnapshot ?? building.name,
          locationCommunity: dto.locationCommunity ?? building.city ?? null,
          propertySizeSqm: dto.propertySizeSqm
            ? new PrismaNamespace.Decimal(dto.propertySizeSqm)
            : null,
          propertyTypeLabel:
            dto.propertyTypeLabel ?? unitWithType?.unitType?.name ?? null,
          propertyNumber: dto.propertyNumber ?? unit.label,
          premisesNoDewa: dto.premisesNoDewa ?? null,
          plotNo: dto.plotNo ?? null,
          contractValue,
          paymentModeText: dto.paymentModeText ?? null,
          leaseStartDate: contractPeriodFrom,
          leaseEndDate: contractPeriodTo,
          annualRent,
          paymentFrequency: dto.paymentFrequency,
          numberOfCheques: dto.numberOfCheques ?? null,
          securityDepositAmount,
          notes: dto.notes ?? null,
        },
        include: contractInclude,
      });

      if (additionalTerms.length > 0) {
        await tx.leaseAdditionalTerm.createMany({
          data: additionalTerms.map((termText) => ({
            leaseId: lease.id,
            orgId,
            termText,
          })),
        });
      }

      await this.leaseHistoryRepo.create(
        {
          orgId,
          leaseId: lease.id,
          action: LeaseHistoryAction.CREATED,
          changedByUserId: user?.sub ?? null,
          changes: buildLeaseCreationChangeSet(lease),
        },
        tx,
      );

      return lease;
    });

    return this.getContractById(user, created.id);
  }

  async listContracts(
    user: AuthenticatedUser | undefined,
    query: ListOrgContractsQueryDto,
  ): Promise<{ items: ContractRecord[]; nextCursor?: string }> {
    const orgId = assertOrgScope(user);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const order: OrgContractOrder = query.order ?? 'desc';
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    const where: PrismaNamespace.LeaseWhereInput = {
      orgId,
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status }
        : {}),
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.residentUserId
        ? {
            OR: [
              { residentUserId: query.residentUserId },
              { occupancy: { residentUserId: query.residentUserId } },
            ],
          }
        : {}),
    };

    const and: PrismaNamespace.LeaseWhereInput[] = [];
    if (query.date_from || query.date_to) {
      and.push({
        leaseStartDate: {
          ...(query.date_from ? { gte: new Date(query.date_from) } : {}),
          ...(query.date_to ? { lte: new Date(query.date_to) } : {}),
        },
      });
    }
    if (query.q) {
      and.push({
        OR: [
          { id: query.q },
          { ijariId: query.q },
          { propertyNumber: { contains: query.q, mode: 'insensitive' } },
          { tenantNameSnapshot: { contains: query.q, mode: 'insensitive' } },
          { tenantEmailSnapshot: { contains: query.q, mode: 'insensitive' } },
          { unit: { label: { contains: query.q, mode: 'insensitive' } } },
          { building: { name: { contains: query.q, mode: 'insensitive' } } },
          {
            residentUser: {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            },
          },
          {
            occupancy: {
              residentUser: {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { email: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }
    if (cursor) {
      const op = order === 'desc' ? 'lt' : 'gt';
      and.push({
        OR: [
          { leaseStartDate: { [op]: cursor.value } },
          {
            AND: [
              { leaseStartDate: cursor.value },
              { id: { [op]: cursor.id } },
            ],
          },
        ],
      });
    }
    if (and.length > 0) {
      where.AND = and;
    }

    const rows = await this.prisma.lease.findMany({
      where,
      orderBy: [{ leaseStartDate: order }, { id: order }],
      include: contractInclude,
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? this.encodeCursor(items[items.length - 1])
      : undefined;
    return { items, nextCursor };
  }

  async listResidentContracts(
    user: AuthenticatedUser | undefined,
    query: ListResidentContractsQueryDto,
  ): Promise<{ items: ContractRecord[]; nextCursor?: string }> {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const order: OrgContractOrder = query.order ?? 'desc';
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    const where: PrismaNamespace.LeaseWhereInput = {
      orgId,
      OR: [
        { residentUserId: userId },
        { occupancy: { residentUserId: userId } },
      ],
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status }
        : {}),
    };

    if (cursor) {
      const op = order === 'desc' ? 'lt' : 'gt';
      where.AND = [
        {
          OR: [
            { leaseStartDate: { [op]: cursor.value } },
            {
              AND: [
                { leaseStartDate: cursor.value },
                { id: { [op]: cursor.id } },
              ],
            },
          ],
        },
      ];
    }

    const rows = await this.prisma.lease.findMany({
      where,
      orderBy: [{ leaseStartDate: order }, { id: order }],
      include: contractInclude,
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? this.encodeCursor(items[items.length - 1])
      : undefined;
    return { items, nextCursor };
  }

  async getResidentContractById(
    user: AuthenticatedUser | undefined,
    contractId: string,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.findContractOrThrow(orgId, contractId);
    this.assertContractResidentOwnership(contract, userId);
    return contract;
  }

  async getContractById(
    user: AuthenticatedUser | undefined,
    contractId: string,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);
    return this.findContractOrThrow(orgId, contractId);
  }

  async updateContract(
    user: AuthenticatedUser | undefined,
    contractId: string,
    dto: UpdateContractDto,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);
    const before = await this.findContractOrThrow(orgId, contractId);

    if (before.status === LeaseStatus.ACTIVE && before.ijariId) {
      const legalFields: (keyof UpdateContractDto)[] = [
        'contractPeriodFrom',
        'contractPeriodTo',
        'annualRent',
        'paymentFrequency',
        'numberOfCheques',
        'securityDepositAmount',
        'contractValue',
        'paymentModeText',
        'ijariId',
        'contractDate',
        'propertyUsage',
        'ownerNameSnapshot',
        'landlordNameSnapshot',
        'tenantNameSnapshot',
        'tenantEmailSnapshot',
        'landlordEmailSnapshot',
        'tenantPhoneSnapshot',
        'landlordPhoneSnapshot',
        'buildingNameSnapshot',
        'locationCommunity',
        'propertySizeSqm',
        'propertyTypeLabel',
        'propertyNumber',
        'premisesNoDewa',
        'plotNo',
      ];
      if (legalFields.some((field) => dto[field] !== undefined)) {
        throw new ConflictException(
          'Legal contract fields are locked for active Ejari-linked contracts. Use amendment/renewal flow.',
        );
      }
    }

    if (dto.contractPeriodFrom || dto.contractPeriodTo) {
      const from = new Date(dto.contractPeriodFrom ?? before.leaseStartDate);
      const to = new Date(dto.contractPeriodTo ?? before.leaseEndDate);
      if (to.getTime() <= from.getTime()) {
        throw new BadRequestException(
          'contractPeriodTo must be after contractPeriodFrom',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.update({
        where: { id: contractId },
        data: {
          ...(dto.contractPeriodFrom !== undefined
            ? { leaseStartDate: new Date(dto.contractPeriodFrom) }
            : {}),
          ...(dto.contractPeriodTo !== undefined
            ? { leaseEndDate: new Date(dto.contractPeriodTo) }
            : {}),
          ...(dto.annualRent !== undefined
            ? { annualRent: new PrismaNamespace.Decimal(dto.annualRent) }
            : {}),
          ...(dto.paymentFrequency !== undefined
            ? { paymentFrequency: dto.paymentFrequency }
            : {}),
          ...(dto.numberOfCheques !== undefined
            ? { numberOfCheques: dto.numberOfCheques }
            : {}),
          ...(dto.securityDepositAmount !== undefined
            ? {
                securityDepositAmount: new PrismaNamespace.Decimal(
                  dto.securityDepositAmount,
                ),
              }
            : {}),
          ...(dto.contractValue !== undefined
            ? {
                contractValue:
                  dto.contractValue === null
                    ? null
                    : new PrismaNamespace.Decimal(dto.contractValue),
              }
            : {}),
          ...(dto.paymentModeText !== undefined
            ? { paymentModeText: dto.paymentModeText }
            : {}),
          ...(dto.ijariId !== undefined ? { ijariId: dto.ijariId } : {}),
          ...(dto.contractDate !== undefined
            ? {
                contractDate:
                  dto.contractDate === null ? null : new Date(dto.contractDate),
              }
            : {}),
          ...(dto.propertyUsage !== undefined
            ? { propertyUsage: dto.propertyUsage }
            : {}),
          ...(dto.ownerNameSnapshot !== undefined
            ? { ownerNameSnapshot: dto.ownerNameSnapshot }
            : {}),
          ...(dto.landlordNameSnapshot !== undefined
            ? { landlordNameSnapshot: dto.landlordNameSnapshot }
            : {}),
          ...(dto.tenantNameSnapshot !== undefined
            ? { tenantNameSnapshot: dto.tenantNameSnapshot }
            : {}),
          ...(dto.tenantEmailSnapshot !== undefined
            ? { tenantEmailSnapshot: dto.tenantEmailSnapshot }
            : {}),
          ...(dto.landlordEmailSnapshot !== undefined
            ? { landlordEmailSnapshot: dto.landlordEmailSnapshot }
            : {}),
          ...(dto.tenantPhoneSnapshot !== undefined
            ? { tenantPhoneSnapshot: dto.tenantPhoneSnapshot }
            : {}),
          ...(dto.landlordPhoneSnapshot !== undefined
            ? { landlordPhoneSnapshot: dto.landlordPhoneSnapshot }
            : {}),
          ...(dto.buildingNameSnapshot !== undefined
            ? { buildingNameSnapshot: dto.buildingNameSnapshot }
            : {}),
          ...(dto.locationCommunity !== undefined
            ? { locationCommunity: dto.locationCommunity }
            : {}),
          ...(dto.propertySizeSqm !== undefined
            ? {
                propertySizeSqm:
                  dto.propertySizeSqm === null
                    ? null
                    : new PrismaNamespace.Decimal(dto.propertySizeSqm),
              }
            : {}),
          ...(dto.propertyTypeLabel !== undefined
            ? { propertyTypeLabel: dto.propertyTypeLabel }
            : {}),
          ...(dto.propertyNumber !== undefined
            ? { propertyNumber: dto.propertyNumber }
            : {}),
          ...(dto.premisesNoDewa !== undefined
            ? { premisesNoDewa: dto.premisesNoDewa }
            : {}),
          ...(dto.plotNo !== undefined ? { plotNo: dto.plotNo } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });

      const changes = buildLeaseChangeSet(before, lease);
      if (Object.keys(changes).length > 0) {
        await this.leaseHistoryRepo.create(
          {
            orgId,
            leaseId: lease.id,
            action: LeaseHistoryAction.UPDATED,
            changedByUserId: user?.sub ?? null,
            changes,
          },
          tx,
        );
      }

      return lease;
    });

    return this.findContractOrThrow(orgId, updated.id);
  }

  async activateContract(
    user: AuthenticatedUser | undefined,
    contractId: string,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);
    const existing = await this.findContractOrThrow(orgId, contractId);
    if (existing.status === LeaseStatus.ENDED) {
      throw new ConflictException('Ended contract cannot be activated');
    }
    if (existing.status === LeaseStatus.ACTIVE) {
      return existing;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lease.update({
        where: { id: existing.id },
        data: { status: LeaseStatus.ACTIVE },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: existing.id,
          action: LeaseActivityAction.CONTRACT_ACTIVATED,
          changedByUserId: user?.sub ?? null,
          payload: {
            fromStatus: existing.status,
            toStatus: LeaseStatus.ACTIVE,
          },
        },
        tx,
      );
    });

    return this.findContractOrThrow(orgId, contractId);
  }

  async cancelContract(
    user: AuthenticatedUser | undefined,
    contractId: string,
    reason?: string,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);
    const existing = await this.findContractOrThrow(orgId, contractId);
    if (existing.status === LeaseStatus.ENDED) {
      throw new ConflictException('Ended contract cannot be cancelled');
    }

    if (existing.status === LeaseStatus.ACTIVE && existing.occupancyId) {
      await this.leaseLifecycleService.moveOut(
        user,
        existing.buildingId,
        existing.id,
        {
          actualMoveOutDate: new Date().toISOString(),
        },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.moveInRequest.updateMany({
        where: {
          orgId,
          leaseId: existing.id,
          status: {
            in: [MoveRequestStatus.PENDING, MoveRequestStatus.APPROVED],
          },
        },
        data: { status: MoveRequestStatus.CANCELLED },
      });
      await tx.moveOutRequest.updateMany({
        where: {
          orgId,
          leaseId: existing.id,
          status: {
            in: [MoveRequestStatus.PENDING, MoveRequestStatus.APPROVED],
          },
        },
        data: { status: MoveRequestStatus.CANCELLED },
      });
      await tx.lease.update({
        where: { id: existing.id },
        data: { status: LeaseStatus.CANCELLED },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: existing.id,
          action: LeaseActivityAction.CONTRACT_CANCELLED,
          changedByUserId: user?.sub ?? null,
          payload: {
            fromStatus: existing.status,
            toStatus: LeaseStatus.CANCELLED,
            reason: reason ?? null,
          },
        },
        tx,
      );
    });

    return this.findContractOrThrow(orgId, contractId);
  }

  async replaceAdditionalTerms(
    user: AuthenticatedUser | undefined,
    contractId: string,
    dto: ReplaceContractAdditionalTermsDto,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);
    await this.findContractOrThrow(orgId, contractId);
    const terms = this.normalizeTerms(dto.terms);

    await this.prisma.$transaction(async (tx) => {
      await tx.leaseAdditionalTerm.deleteMany({
        where: { leaseId: contractId },
      });
      if (terms.length > 0) {
        await tx.leaseAdditionalTerm.createMany({
          data: terms.map((termText) => ({
            leaseId: contractId,
            orgId,
            termText,
          })),
        });
      }
    });

    return this.findContractOrThrow(orgId, contractId);
  }

  async getLatestContractForResident(
    user: AuthenticatedUser | undefined,
    residentUserId: string,
  ): Promise<ContractRecord | null> {
    const orgId = assertOrgScope(user);
    return this.prisma.lease.findFirst({
      where: {
        orgId,
        OR: [{ residentUserId }, { occupancy: { residentUserId } }],
      },
      include: contractInclude,
      orderBy: [{ leaseStartDate: 'desc' }, { id: 'desc' }],
    });
  }

  async getLatestContractSummaryForResident(
    user: AuthenticatedUser | undefined,
  ): Promise<ResidentLatestContractSummary> {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.prisma.lease.findFirst({
      where: {
        orgId,
        OR: [
          { residentUserId: userId },
          { occupancy: { residentUserId: userId } },
        ],
      },
      include: contractInclude,
      orderBy: [{ leaseStartDate: 'desc' }, { id: 'desc' }],
    });

    if (!contract) {
      return {
        contract: null,
        canRequestMoveIn: false,
        canRequestMoveOut: false,
        latestMoveInRequestStatus: null,
        latestMoveOutRequestStatus: null,
      };
    }

    const [latestMoveInRequest, latestMoveOutRequest] = await Promise.all([
      this.prisma.moveInRequest.findFirst({
        where: { orgId, leaseId: contract.id },
        select: { status: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.moveOutRequest.findFirst({
        where: { orgId, leaseId: contract.id },
        select: { status: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const latestMoveInRequestStatus = latestMoveInRequest?.status ?? null;
    const latestMoveOutRequestStatus = latestMoveOutRequest?.status ?? null;
    const blocksMoveInRequest =
      latestMoveInRequestStatus === MoveRequestStatus.PENDING ||
      latestMoveInRequestStatus === MoveRequestStatus.APPROVED;
    const blocksMoveOutRequest =
      latestMoveOutRequestStatus === MoveRequestStatus.PENDING ||
      latestMoveOutRequestStatus === MoveRequestStatus.APPROVED;
    const hasActiveOccupancy = Boolean(
      contract.occupancyId && contract.occupancy?.status === 'ACTIVE',
    );

    return {
      contract,
      canRequestMoveIn:
        contract.status === LeaseStatus.ACTIVE &&
        !hasActiveOccupancy &&
        !blocksMoveInRequest,
      canRequestMoveOut:
        contract.status === LeaseStatus.ACTIVE &&
        hasActiveOccupancy &&
        !blocksMoveOutRequest,
      latestMoveInRequestStatus,
      latestMoveOutRequestStatus,
    };
  }

  async createResidentMoveInRequest(
    user: AuthenticatedUser | undefined,
    contractId: string,
    dto: CreateMoveRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.findContractOrThrow(orgId, contractId);
    this.assertContractResidentOwnership(contract, userId);
    if (contract.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Move-in requests require active contract');
    }
    if (contract.occupancyId) {
      throw new ConflictException('Contract is already moved in');
    }

    const existingOpen = await this.prisma.moveInRequest.findFirst({
      where: {
        orgId,
        leaseId: contract.id,
        status: {
          in: [MoveRequestStatus.PENDING, MoveRequestStatus.APPROVED],
        },
      },
    });
    if (existingOpen) {
      throw new ConflictException(
        'A move-in request is already pending or approved',
      );
    }

    const requestedMoveAt = new Date(dto.requestedMoveAt);
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.moveInRequest.create({
        data: {
          orgId,
          buildingId: contract.buildingId,
          unitId: contract.unitId,
          leaseId: contract.id,
          residentUserId: userId,
          status: MoveRequestStatus.PENDING,
          requestedMoveAt,
          notes: dto.notes ?? null,
        },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: contract.id,
          action: LeaseActivityAction.MOVE_IN_REQUEST_CREATED,
          changedByUserId: userId,
          payload: {
            requestId: created.id,
            requestedMoveAt: requestedMoveAt.toISOString(),
            notes: dto.notes ?? null,
          },
        },
        tx,
      );
      return created;
    });

    await this.notifyMoveRequestCreated({
      orgId,
      buildingId: contract.buildingId,
      unitLabel: contract.unit?.label ?? null,
      residentName: contract.residentUser?.name ?? null,
      requestId: request.id,
      requestType: 'MOVE_IN',
      requestedMoveAt,
      notes: dto.notes ?? null,
    });

    return request;
  }

  async createResidentMoveOutRequest(
    user: AuthenticatedUser | undefined,
    contractId: string,
    dto: CreateMoveRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.findContractOrThrow(orgId, contractId);
    this.assertContractResidentOwnership(contract, userId);
    if (contract.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        'Move-out requests require active contract',
      );
    }
    if (!contract.occupancyId || contract.occupancy?.status !== 'ACTIVE') {
      throw new ConflictException('Move-out request requires active occupancy');
    }

    const existingOpen = await this.prisma.moveOutRequest.findFirst({
      where: {
        orgId,
        leaseId: contract.id,
        status: {
          in: [MoveRequestStatus.PENDING, MoveRequestStatus.APPROVED],
        },
      },
    });
    if (existingOpen) {
      throw new ConflictException(
        'A move-out request is already pending or approved',
      );
    }

    const requestedMoveAt = new Date(dto.requestedMoveAt);
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.moveOutRequest.create({
        data: {
          orgId,
          buildingId: contract.buildingId,
          unitId: contract.unitId,
          leaseId: contract.id,
          residentUserId: userId,
          status: MoveRequestStatus.PENDING,
          requestedMoveAt,
          notes: dto.notes ?? null,
        },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: contract.id,
          action: LeaseActivityAction.MOVE_OUT_REQUEST_CREATED,
          changedByUserId: userId,
          payload: {
            requestId: created.id,
            requestedMoveAt: requestedMoveAt.toISOString(),
            notes: dto.notes ?? null,
          },
        },
        tx,
      );
      return created;
    });

    await this.notifyMoveRequestCreated({
      orgId,
      buildingId: contract.buildingId,
      unitLabel: contract.unit?.label ?? null,
      residentName: contract.residentUser?.name ?? null,
      requestId: request.id,
      requestType: 'MOVE_OUT',
      requestedMoveAt,
      notes: dto.notes ?? null,
    });

    return request;
  }

  async listResidentMoveInRequests(
    user: AuthenticatedUser | undefined,
    contractId: string,
    query: ListMoveRequestsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.findContractOrThrow(orgId, contractId);
    this.assertContractResidentOwnership(contract, userId);

    return this.prisma.moveInRequest.findMany({
      where: {
        orgId,
        leaseId: contract.id,
        residentUserId: userId,
        ...(query.status && query.status !== 'ALL'
          ? { status: query.status }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async listResidentMoveOutRequests(
    user: AuthenticatedUser | undefined,
    contractId: string,
    query: ListMoveRequestsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.findContractOrThrow(orgId, contractId);
    this.assertContractResidentOwnership(contract, userId);

    return this.prisma.moveOutRequest.findMany({
      where: {
        orgId,
        leaseId: contract.id,
        residentUserId: userId,
        ...(query.status && query.status !== 'ALL'
          ? { status: query.status }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createResidentContractDocumentUploadUrl(
    user: AuthenticatedUser | undefined,
    contractId: string,
    dto: CreateResidentContractUploadUrlDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.findContractOrThrow(orgId, contractId);
    this.assertContractResidentOwnership(contract, userId);

    const documentType = dto.type ?? LeaseDocumentType.SIGNED_TENANCY_CONTRACT;
    if (documentType !== LeaseDocumentType.SIGNED_TENANCY_CONTRACT) {
      throw new BadRequestException(
        'Residents can only upload signed tenancy contract documents',
      );
    }

    if (dto.sizeBytes > this.residentContractDocumentMaxSizeBytes) {
      throw new BadRequestException(
        `File size exceeds ${this.residentContractDocumentMaxSizeBytes} bytes`,
      );
    }
    if (!this.isAllowedResidentContractMimeType(dto.mimeType)) {
      throw new BadRequestException(
        'Unsupported file type for contract upload',
      );
    }

    const safeFileName = this.sanitizeFileName(dto.fileName);
    const objectKey = [
      'contracts',
      orgId,
      contract.id,
      'resident',
      `${Date.now()}-${randomUUID()}-${safeFileName}`,
    ].join('/');
    const uploadUrl = await this.storageService.getUploadSignedUrl({
      key: objectKey,
      contentType: dto.mimeType,
      expiresInSeconds: this.residentContractDocumentUploadExpirySeconds,
    });

    return {
      uploadUrl,
      storageUrl: `storage://${objectKey}`,
      objectKey,
      type: documentType,
      expiresInSeconds: this.residentContractDocumentUploadExpirySeconds,
    };
  }

  async createResidentContractDocument(
    user: AuthenticatedUser | undefined,
    contractId: string,
    dto: CreateLeaseDocumentDto,
  ): Promise<LeaseDocument> {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const contract = await this.findContractOrThrow(orgId, contractId);
    this.assertContractResidentOwnership(contract, userId);

    if (dto.type !== LeaseDocumentType.SIGNED_TENANCY_CONTRACT) {
      throw new BadRequestException(
        'Residents can only upload signed tenancy contract documents',
      );
    }

    this.assertResidentDocumentUrlBelongsToContract(
      dto.url,
      orgId,
      contract.id,
    );
    return this.leaseDocumentsService.createDocument(user, contract.id, dto);
  }

  async listMoveInRequests(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    query: ListMoveRequestsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return this.prisma.moveInRequest.findMany({
      where: {
        orgId,
        buildingId,
        ...(query.status && query.status !== 'ALL'
          ? { status: query.status }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async listMoveOutRequests(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    query: ListMoveRequestsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return this.prisma.moveOutRequest.findMany({
      where: {
        orgId,
        buildingId,
        ...(query.status && query.status !== 'ALL'
          ? { status: query.status }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getMoveRequestInboxCount(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const effectivePermissions =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
      });

    const canReviewAll = hasAllPermissionMatches(effectivePermissions, [
      'contracts.move_requests.review',
    ]);

    const buildingIds = canReviewAll
      ? []
      : await this.getManagedBuildingIds(orgId, userId);

    if (!canReviewAll && buildingIds.length === 0) {
      return { moveInCount: 0, moveOutCount: 0, totalCount: 0 };
    }

    const where = canReviewAll
      ? { orgId, status: MoveRequestStatus.PENDING }
      : {
          orgId,
          status: MoveRequestStatus.PENDING,
          buildingId: { in: buildingIds },
        };

    const [moveInCount, moveOutCount] = await Promise.all([
      this.prisma.moveInRequest.count({ where }),
      this.prisma.moveOutRequest.count({ where }),
    ]);

    return {
      moveInCount,
      moveOutCount,
      totalCount: moveInCount + moveOutCount,
    };
  }

  async approveMoveInRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const reviewerId = user?.sub ?? null;
    const request = await this.prisma.moveInRequest.findFirst({
      where: { id: requestId, orgId },
    });
    if (!request) {
      throw new NotFoundException('Move-in request not found');
    }
    await this.assertAssignedMoveManagementAccess(
      user,
      request.buildingId,
      MOVE_REVIEW_PERMISSION,
    );
    if (request.status !== MoveRequestStatus.PENDING) {
      throw new ConflictException('Move-in request is not pending');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.moveInRequest.update({
        where: { id: request.id },
        data: {
          status: MoveRequestStatus.APPROVED,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: request.leaseId,
          action: LeaseActivityAction.MOVE_IN_REQUEST_APPROVED,
          changedByUserId: reviewerId,
          payload: { requestId: request.id },
        },
        tx,
      );
      return updated;
    });
  }

  async rejectMoveInRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: RejectMoveRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const reviewerId = user?.sub ?? null;
    const request = await this.prisma.moveInRequest.findFirst({
      where: { id: requestId, orgId },
    });
    if (!request) {
      throw new NotFoundException('Move-in request not found');
    }
    await this.assertAssignedMoveManagementAccess(
      user,
      request.buildingId,
      MOVE_REVIEW_PERMISSION,
    );
    if (request.status !== MoveRequestStatus.PENDING) {
      throw new ConflictException('Move-in request is not pending');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.moveInRequest.update({
        where: { id: request.id },
        data: {
          status: MoveRequestStatus.REJECTED,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: dto.rejectionReason ?? null,
        },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: request.leaseId,
          action: LeaseActivityAction.MOVE_IN_REQUEST_REJECTED,
          changedByUserId: reviewerId,
          payload: {
            requestId: request.id,
            rejectionReason: dto.rejectionReason ?? null,
          },
        },
        tx,
      );
      return updated;
    });
  }

  async approveMoveOutRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const reviewerId = user?.sub ?? null;
    const request = await this.prisma.moveOutRequest.findFirst({
      where: { id: requestId, orgId },
    });
    if (!request) {
      throw new NotFoundException('Move-out request not found');
    }
    await this.assertAssignedMoveManagementAccess(
      user,
      request.buildingId,
      MOVE_REVIEW_PERMISSION,
    );
    if (request.status !== MoveRequestStatus.PENDING) {
      throw new ConflictException('Move-out request is not pending');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.moveOutRequest.update({
        where: { id: request.id },
        data: {
          status: MoveRequestStatus.APPROVED,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: request.leaseId,
          action: LeaseActivityAction.MOVE_OUT_REQUEST_APPROVED,
          changedByUserId: reviewerId,
          payload: { requestId: request.id },
        },
        tx,
      );
      return updated;
    });
  }

  async rejectMoveOutRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: RejectMoveRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const reviewerId = user?.sub ?? null;
    const request = await this.prisma.moveOutRequest.findFirst({
      where: { id: requestId, orgId },
    });
    if (!request) {
      throw new NotFoundException('Move-out request not found');
    }
    await this.assertAssignedMoveManagementAccess(
      user,
      request.buildingId,
      MOVE_REVIEW_PERMISSION,
    );
    if (request.status !== MoveRequestStatus.PENDING) {
      throw new ConflictException('Move-out request is not pending');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.moveOutRequest.update({
        where: { id: request.id },
        data: {
          status: MoveRequestStatus.REJECTED,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: dto.rejectionReason ?? null,
        },
      });
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: request.leaseId,
          action: LeaseActivityAction.MOVE_OUT_REQUEST_REJECTED,
          changedByUserId: reviewerId,
          payload: {
            requestId: request.id,
            rejectionReason: dto.rejectionReason ?? null,
          },
        },
        tx,
      );
      return updated;
    });
  }

  async executeApprovedMoveIn(
    user: AuthenticatedUser | undefined,
    contractId: string,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);

    await this.prisma.$transaction(async (tx) => {
      const contract = await tx.lease.findFirst({
        where: { id: contractId, orgId },
      });
      if (!contract) throw new NotFoundException('Contract not found');
      await this.assertAssignedMoveManagementAccess(
        user,
        contract.buildingId,
        MOVE_IN_EXECUTE_PERMISSION,
      );
      if (contract.status !== LeaseStatus.ACTIVE) {
        throw new BadRequestException(
          'Move-in execution requires active contract',
        );
      }
      if (contract.occupancyId)
        throw new ConflictException('Contract already moved in');
      if (!contract.residentUserId) {
        throw new ConflictException('Contract has no resident assigned');
      }

      const approvedRequest = await tx.moveInRequest.findFirst({
        where: {
          orgId,
          leaseId: contract.id,
          status: MoveRequestStatus.APPROVED,
        },
        orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }],
      });
      if (!approvedRequest) {
        throw new ConflictException('No approved move-in request found');
      }

      const unitActive = await tx.occupancy.findFirst({
        where: { unitId: contract.unitId, status: 'ACTIVE' },
      });
      if (unitActive)
        throw new ConflictException('Unit already has an active occupancy');

      const residentActive = await tx.occupancy.findFirst({
        where: { residentUserId: contract.residentUserId, status: 'ACTIVE' },
      });
      if (residentActive) {
        throw new ConflictException('Resident already has an active occupancy');
      }

      const executedAt = new Date();
      const occupancy = await tx.occupancy.create({
        data: {
          buildingId: contract.buildingId,
          unitId: contract.unitId,
          residentUserId: contract.residentUserId,
          status: 'ACTIVE',
          startAt: executedAt,
          endAt: null,
        },
      });

      await tx.lease.update({
        where: { id: contract.id },
        data: { occupancyId: occupancy.id, status: LeaseStatus.ACTIVE },
      });

      await tx.moveInRequest.update({
        where: { id: approvedRequest.id },
        data: { status: MoveRequestStatus.COMPLETED },
      });

      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: contract.id,
          action: LeaseActivityAction.MOVE_IN,
          changedByUserId: user?.sub ?? null,
          payload: {
            requestId: approvedRequest.id,
            occupancyId: occupancy.id,
            requestedMoveAt: approvedRequest.requestedMoveAt.toISOString(),
            actualMoveInAt: executedAt.toISOString(),
          },
        },
        tx,
      );
    });

    return this.findContractOrThrow(orgId, contractId);
  }

  async executeApprovedMoveOut(
    user: AuthenticatedUser | undefined,
    contractId: string,
  ): Promise<ContractRecord> {
    const orgId = assertOrgScope(user);
    const contract = await this.findContractOrThrow(orgId, contractId);
    await this.assertAssignedMoveManagementAccess(
      user,
      contract.buildingId,
      MOVE_OUT_EXECUTE_PERMISSION,
    );
    if (!contract.occupancyId) {
      throw new ConflictException(
        'Contract has no active occupancy to move out',
      );
    }

    const approvedRequest = await this.prisma.moveOutRequest.findFirst({
      where: {
        orgId,
        leaseId: contract.id,
        status: MoveRequestStatus.APPROVED,
      },
      orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!approvedRequest) {
      throw new ConflictException('No approved move-out request found');
    }

    await this.leaseLifecycleService.moveOut(
      user,
      contract.buildingId,
      contract.id,
      {
        actualMoveOutDate: approvedRequest.requestedMoveAt.toISOString(),
      },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.moveOutRequest.update({
        where: { id: approvedRequest.id },
        data: { status: MoveRequestStatus.COMPLETED },
      });

      if (
        approvedRequest.requestedMoveAt.getTime() <
        contract.leaseEndDate.getTime()
      ) {
        await tx.lease.update({
          where: { id: contract.id },
          data: { status: LeaseStatus.CANCELLED },
        });
        await this.leaseActivityRepo.create(
          {
            orgId,
            leaseId: contract.id,
            action: LeaseActivityAction.CONTRACT_CANCELLED,
            changedByUserId: user?.sub ?? null,
            payload: {
              reason: 'EARLY_MOVE_OUT',
              requestId: approvedRequest.id,
            },
          },
          tx,
        );
      }
    });

    return this.findContractOrThrow(orgId, contractId);
  }

  private async findContractOrThrow(
    orgId: string,
    contractId: string,
  ): Promise<ContractRecord> {
    const contract = await this.prisma.lease.findFirst({
      where: { id: contractId, orgId },
      include: contractInclude,
    });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    return contract;
  }

  private assertContractResidentOwnership(
    contract: ContractRecord,
    userId: string,
  ) {
    const contractResidentId =
      contract.residentUserId ?? contract.occupancy?.residentUser?.id;
    if (!contractResidentId || contractResidentId !== userId) {
      throw new UnauthorizedException(
        'Not allowed to request move for this contract',
      );
    }
  }

  private normalizeTerms(terms: string[]) {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const term of terms) {
      const trimmed = term.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(trimmed);
    }
    return normalized;
  }

  private sanitizeFileName(fileName: string) {
    const trimmed = fileName.trim();
    if (!trimmed) {
      throw new BadRequestException('fileName is required');
    }
    const compact = trimmed
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    return compact.slice(0, 120);
  }

  private isAllowedResidentContractMimeType(mimeType: string) {
    const normalized = mimeType.trim().toLowerCase();
    return new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]).has(normalized);
  }

  private assertResidentDocumentUrlBelongsToContract(
    url: string,
    orgId: string,
    contractId: string,
  ) {
    if (!url.startsWith('storage://')) {
      return;
    }
    const objectKey = url.slice('storage://'.length);
    const expectedPrefix = `contracts/${orgId}/${contractId}/resident/`;
    if (!objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        'Uploaded document key does not match this contract',
      );
    }
  }

  private async notifyMoveRequestCreated(input: {
    orgId: string;
    buildingId: string;
    unitLabel: string | null;
    residentName: string | null;
    requestId: string;
    requestType: 'MOVE_IN' | 'MOVE_OUT';
    requestedMoveAt: Date;
    notes: string | null;
  }) {
    const recipientUserIds = await this.resolveMoveRequestRecipients(
      input.orgId,
      input.buildingId,
    );
    if (recipientUserIds.length === 0) {
      return;
    }

    const isMoveIn = input.requestType === 'MOVE_IN';
    const title = isMoveIn ? 'New move-in request' : 'New move-out request';
    const body = [
      input.unitLabel ? `Unit ${input.unitLabel}` : null,
      input.residentName,
      isMoveIn ? 'requested move-in' : 'requested move-out',
    ]
      .filter((value): value is string => Boolean(value))
      .join(' - ');

    await this.notificationsService.createForUsers({
      orgId: input.orgId,
      userIds: recipientUserIds,
      type: isMoveIn
        ? NotificationTypeEnum.MOVE_IN_REQUEST_CREATED
        : NotificationTypeEnum.MOVE_OUT_REQUEST_CREATED,
      title,
      body,
      data: {
        kind: 'move_request',
        requestId: input.requestId,
        requestType: input.requestType,
        buildingId: input.buildingId,
        unitLabel: input.unitLabel,
        residentName: input.residentName,
        requestedMoveAt: input.requestedMoveAt.toISOString(),
        notes: input.notes,
      },
    });
  }

  private async resolveMoveRequestRecipients(
    orgId: string,
    buildingId: string,
  ) {
    const [assignedUsers, orgUsers] = await Promise.all([
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
                  key: MOVE_REVIEW_PERMISSION,
                },
              },
            },
          },
          user: { orgId, isActive: true },
        },
        select: { userId: true },
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
                  key: MOVE_REVIEW_PERMISSION,
                },
              },
            },
          },
          user: { orgId, isActive: true },
        },
        select: { userId: true },
      }),
    ]);

    return Array.from(
      new Set([
        ...assignedUsers.map((assignment) => assignment.userId),
        ...orgUsers.map((assignment) => assignment.userId),
      ]),
    );
  }

  private async getManagedBuildingIds(orgId: string, userId: string) {
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
                key: MOVE_REVIEW_PERMISSION,
              },
            },
          },
        },
      },
      select: { scopeId: true },
    });

    return Array.from(
      new Set(
        assignments
          .map((assignment) => assignment.scopeId)
          .filter((scopeId): scopeId is string => Boolean(scopeId)),
      ),
    );
  }

  private async assertAssignedMoveManagementAccess(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requiredPermission: string,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const orgId = assertOrgScope(user);
    const effectivePermissions =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
        buildingId,
      });
    if (hasAllPermissionMatches(effectivePermissions, [requiredPermission])) {
      return;
    }

    throw new ForbiddenException('Forbidden');
  }

  private encodeCursor(item: { id: string; leaseStartDate: Date }) {
    return Buffer.from(
      JSON.stringify({ id: item.id, value: item.leaseStartDate.toISOString() }),
    ).toString('base64');
  }

  private decodeCursor(cursor: string): { id: string; value: Date } {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as { id: string; value: string };
      if (!decoded?.id || !decoded?.value) {
        throw new Error('Invalid cursor');
      }
      const value = new Date(decoded.value);
      if (Number.isNaN(value.getTime())) {
        throw new Error('Invalid cursor date');
      }
      return { id: decoded.id, value };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
}

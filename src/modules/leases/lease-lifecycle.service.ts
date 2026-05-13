import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  LeaseActivityAction,
  LeaseHistoryAction,
  Prisma as PrismaNamespace,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { UnitsRepo } from '../units/units.repo';
import { LeasesRepo } from './leases.repo';
import {
  detectOccupancyConstraint,
  mapOccupancyConstraintError,
} from '../../common/utils/occupancy-constraints';
import { MoveInDto } from './dto/move-in.dto';
import { MoveOutDto } from './dto/move-out.dto';
import { LeaseDocumentsRepo } from './lease-documents.repo';
import { LeaseAccessCardsRepo } from './lease-access-cards.repo';
import { LeaseParkingStickersRepo } from './lease-parking-stickers.repo';
import { LeaseOccupantsRepo } from './lease-occupants.repo';
import { ResidentProfilesRepo } from '../residents/resident-profiles.repo';
import { ParkingRepo } from '../parking/parking.repo';
import { LeaseActivityRepo } from './lease-activity.repo';
import { LeaseHistoryRepo } from './lease-history.repo';
import {
  describeEmailOwnershipConflict,
  normalizeEmail,
} from '../users/user-identity.util';
import {
  buildLeaseChangeSet,
  buildLeaseCreationChangeSet,
} from './lease-history.util';

@Injectable()
export class LeaseLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buildingsRepo: BuildingsRepo,
    private readonly unitsRepo: UnitsRepo,
    private readonly leasesRepo: LeasesRepo,
    private readonly leaseDocumentsRepo: LeaseDocumentsRepo,
    private readonly leaseAccessCardsRepo: LeaseAccessCardsRepo,
    private readonly leaseParkingStickersRepo: LeaseParkingStickersRepo,
    private readonly leaseOccupantsRepo: LeaseOccupantsRepo,
    private readonly leaseHistoryRepo: LeaseHistoryRepo,
    private readonly leaseActivityRepo: LeaseActivityRepo,
    private readonly residentProfilesRepo: ResidentProfilesRepo,
    private readonly parkingRepo: ParkingRepo,
  ) {}

  async moveIn(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: MoveInDto,
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

    const leaseStartDate = new Date(dto.leaseStartDate);
    const leaseEndDate = new Date(dto.leaseEndDate);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.lockUnit(tx, unit.id);

        const residentUserId = await this.resolveResidentUser(tx, orgId, dto);

        const unitActive = await tx.occupancy.findFirst({
          where: { unitId: unit.id, status: 'ACTIVE' },
        });
        if (unitActive) {
          throw new ConflictException('Unit already has an active occupancy');
        }

        const residentActive = await tx.occupancy.findFirst({
          where: { residentUserId, status: 'ACTIVE' },
        });
        if (residentActive) {
          throw new ConflictException(
            'Resident already has an active occupancy',
          );
        }

        const occupancy = await tx.occupancy.create({
          data: {
            buildingId,
            unitId: unit.id,
            residentUserId,
            status: 'ACTIVE',
            startAt: leaseStartDate,
            endAt: null,
          },
        });

        const lease = await this.leasesRepo.createLease(tx, {
          orgId,
          buildingId,
          unitId: unit.id,
          occupancyId: occupancy.id,
          status: 'ACTIVE',
          leaseStartDate,
          leaseEndDate,
          tenancyRegistrationExpiry: dto.tenancyRegistrationExpiry
            ? new Date(dto.tenancyRegistrationExpiry)
            : null,
          noticeGivenDate: dto.noticeGivenDate
            ? new Date(dto.noticeGivenDate)
            : null,
          annualRent: new PrismaNamespace.Decimal(dto.annualRent),
          paymentFrequency: dto.paymentFrequency,
          numberOfCheques: dto.numberOfCheques ?? null,
          securityDepositAmount: new PrismaNamespace.Decimal(
            dto.securityDepositAmount,
          ),
          internetTvProvider: dto.internetTvProvider ?? null,
          serviceChargesPaidBy: dto.serviceChargesPaidBy ?? null,
          vatApplicable:
            dto.vatApplicable === undefined ? null : dto.vatApplicable,
          notes: dto.notes ?? null,
          firstPaymentReceived: dto.firstPaymentReceived ?? null,
          firstPaymentAmount: dto.firstPaymentAmount
            ? new PrismaNamespace.Decimal(dto.firstPaymentAmount)
            : null,
          depositReceived: dto.depositReceived ?? null,
          depositReceivedAmount: dto.depositReceivedAmount
            ? new PrismaNamespace.Decimal(dto.depositReceivedAmount)
            : null,
          actualMoveOutDate: null,
          forwardingPhone: null,
          forwardingEmail: null,
          forwardingAddress: null,
          finalElectricityReading: null,
          finalWaterReading: null,
          finalGasReading: null,
          wallsCondition: null,
          floorCondition: null,
          kitchenCondition: null,
          bathroomCondition: null,
          doorsLocksCondition: null,
          keysReturned: null,
          accessCardsReturnedCount: null,
          parkingStickersReturned: null,
          damageDescription: null,
          damageCharges: null,
          pendingRent: null,
          pendingUtilities: null,
          pendingServiceFines: null,
          totalDeductions: null,
          netRefund: null,
          inspectionDoneBy: null,
          inspectionDate: null,
          managerApproval: null,
          refundMethod: null,
          refundDate: null,
          adminNotes: null,
        });

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
        await this.leaseActivityRepo.create(
          {
            orgId,
            leaseId: lease.id,
            action: LeaseActivityAction.MOVE_IN,
            changedByUserId: user?.sub ?? null,
            payload: {
              occupancyId: occupancy.id,
              residentUserId,
              buildingId,
              unitId: unit.id,
              leaseStartDate: leaseStartDate.toISOString(),
              leaseEndDate: leaseEndDate.toISOString(),
            },
          },
          tx,
        );

        if (dto.residentProfile) {
          await this.residentProfilesRepo.upsertByUserId(
            orgId,
            residentUserId,
            {
              emiratesIdNumber: dto.residentProfile.emiratesIdNumber ?? null,
              passportNumber: dto.residentProfile.passportNumber ?? null,
              nationality: dto.residentProfile.nationality ?? null,
              dateOfBirth: dto.residentProfile.dateOfBirth
                ? new Date(dto.residentProfile.dateOfBirth)
                : null,
              currentAddress: dto.residentProfile.currentAddress ?? null,
              emergencyContactName:
                dto.residentProfile.emergencyContactName ?? null,
              emergencyContactPhone:
                dto.residentProfile.emergencyContactPhone ?? null,
            },
            tx,
          );
        }

        if (dto.occupantNames) {
          const names = this.normalizeNames(dto.occupantNames);
          await this.leaseOccupantsRepo.deleteByLeaseId(lease.id, tx);
          await this.leaseOccupantsRepo.createMany(lease.id, names, tx);
        }

        if (dto.parkingSlotIds?.length) {
          await this.allocateParkingSlots(
            tx,
            orgId,
            buildingId,
            dto.parkingSlotIds,
            occupancy.id,
            leaseStartDate,
          );
          await this.leaseActivityRepo.create(
            {
              orgId,
              leaseId: lease.id,
              action: LeaseActivityAction.PARKING_ALLOCATED,
              changedByUserId: user?.sub ?? null,
              payload: {
                slotIds: dto.parkingSlotIds,
                count: dto.parkingSlotIds.length,
                occupancyId: occupancy.id,
              },
            },
            tx,
          );
        }

        if (dto.vehiclePlateNumbers?.length) {
          for (const plate of dto.vehiclePlateNumbers) {
            await this.parkingRepo.createVehicle(
              orgId,
              occupancy.id,
              { plateNumber: plate.trim() },
              tx,
            );
          }
        }

        if (dto.accessCardNumbers?.length) {
          const unique = this.normalizeNames(dto.accessCardNumbers);
          if (unique.length !== dto.accessCardNumbers.length) {
            throw new ConflictException('Duplicate access card numbers');
          }
          const existing = await this.leaseAccessCardsRepo.findByNumbers(
            lease.id,
            unique,
            tx,
          );
          if (existing.length) {
            throw new ConflictException('Access card already exists for lease');
          }
          await this.leaseAccessCardsRepo.createMany(
            lease.id,
            unique.map((cardNumber) => ({ cardNumber })),
            tx,
          );
        }

        if (dto.parkingStickerNumbers?.length) {
          const unique = this.normalizeNames(dto.parkingStickerNumbers);
          if (unique.length !== dto.parkingStickerNumbers.length) {
            throw new ConflictException('Duplicate parking sticker numbers');
          }
          const existing = await this.leaseParkingStickersRepo.findByNumbers(
            lease.id,
            unique,
            tx,
          );
          if (existing.length) {
            throw new ConflictException('Parking sticker already exists');
          }
          await this.leaseParkingStickersRepo.createMany(
            lease.id,
            unique.map((stickerNumber) => ({ stickerNumber })),
            tx,
          );
        }

        if (dto.documents?.length) {
          for (const doc of dto.documents) {
            await this.leaseDocumentsRepo.create(
              orgId,
              lease.id,
              {
                type: doc.type,
                fileName: doc.fileName,
                mimeType: doc.mimeType,
                sizeBytes: doc.sizeBytes,
                url: doc.url,
              },
              tx,
            );
          }
        }

        return lease;
      });

      return result;
    } catch (error: unknown) {
      const mapped = this.mapMoveInConstraintError(error, unit.id, dto);
      if (mapped) throw mapped;
      if (
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const targets = Array.isArray(target)
          ? target
          : typeof target === 'string'
            ? [target]
            : [];
        if (targets.includes('occupancyId')) {
          throw new ConflictException('Lease already exists for occupancy');
        }
        throw new ConflictException('Duplicate value');
      }
      throw error;
    }
  }

  async moveOut(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    leaseId: string,
    dto: MoveOutDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, orgId, buildingId },
    });
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    if (lease.status !== 'ACTIVE') {
      throw new ConflictException('Only active lease can be moved out');
    }
    if (!lease.occupancyId) {
      throw new ConflictException('Lease has no active occupancy');
    }
    const occupancyId = lease.occupancyId;

    const actualMoveOutDate = new Date(dto.actualMoveOutDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.markAllAccessCardsReturned !== false) {
        await tx.leaseAccessCard.updateMany({
          where: { leaseId, status: 'ISSUED' },
          data: { status: 'RETURNED', returnedAt: new Date() },
        });
      }
      if (dto.markAllParkingStickersReturned !== false) {
        await tx.leaseParkingSticker.updateMany({
          where: { leaseId, status: 'ISSUED' },
          data: { status: 'RETURNED', returnedAt: new Date() },
        });
      }

      await tx.parkingAllocation.updateMany({
        where: { orgId, occupancyId, endDate: null },
        data: { endDate: actualMoveOutDate },
      });

      await tx.occupancy.updateMany({
        where: { id: occupancyId },
        data: { status: 'ENDED', endAt: actualMoveOutDate },
      });

      const totalDeductions =
        dto.totalDeductions !== undefined
          ? new PrismaNamespace.Decimal(dto.totalDeductions)
          : lease.totalDeductions
            ? new PrismaNamespace.Decimal(lease.totalDeductions)
            : new PrismaNamespace.Decimal(0);
      const securityDeposit = new PrismaNamespace.Decimal(
        lease.securityDepositAmount,
      );
      const netRefund =
        dto.netRefund !== undefined
          ? new PrismaNamespace.Decimal(dto.netRefund)
          : PrismaNamespace.Decimal.max(
              new PrismaNamespace.Decimal(0),
              securityDeposit.minus(totalDeductions),
            );

      const updatedLease = await tx.lease.update({
        where: { id: lease.id },
        data: {
          status: 'ENDED',
          actualMoveOutDate,
          forwardingPhone: dto.forwardingPhone ?? null,
          forwardingEmail: dto.forwardingEmail ?? null,
          forwardingAddress: dto.forwardingAddress ?? null,
          finalElectricityReading: dto.finalElectricityReading ?? null,
          finalWaterReading: dto.finalWaterReading ?? null,
          finalGasReading: dto.finalGasReading ?? null,
          wallsCondition: dto.wallsCondition ?? null,
          floorCondition: dto.floorCondition ?? null,
          kitchenCondition: dto.kitchenCondition ?? null,
          bathroomCondition: dto.bathroomCondition ?? null,
          doorsLocksCondition: dto.doorsLocksCondition ?? null,
          keysReturned: dto.keysReturned ?? null,
          accessCardsReturnedCount: dto.accessCardsReturnedCount ?? null,
          parkingStickersReturned: dto.parkingStickersReturned ?? null,
          damageDescription: dto.damageDescription ?? null,
          damageCharges: dto.damageCharges
            ? new PrismaNamespace.Decimal(dto.damageCharges)
            : null,
          pendingRent: dto.pendingRent
            ? new PrismaNamespace.Decimal(dto.pendingRent)
            : null,
          pendingUtilities: dto.pendingUtilities
            ? new PrismaNamespace.Decimal(dto.pendingUtilities)
            : null,
          pendingServiceFines: dto.pendingServiceFines
            ? new PrismaNamespace.Decimal(dto.pendingServiceFines)
            : null,
          totalDeductions,
          netRefund,
          inspectionDoneBy: dto.inspectionDoneBy ?? null,
          inspectionDate: dto.inspectionDate
            ? new Date(dto.inspectionDate)
            : null,
          managerApproval: dto.managerApproval ?? null,
          refundMethod: dto.refundMethod ?? null,
          refundDate: dto.refundDate ? new Date(dto.refundDate) : null,
          adminNotes: dto.adminNotes ?? null,
        },
      });

      const changes = buildLeaseChangeSet(lease, updatedLease);
      if (Object.keys(changes).length > 0) {
        await this.leaseHistoryRepo.create(
          {
            orgId,
            leaseId: updatedLease.id,
            action: LeaseHistoryAction.MOVED_OUT,
            changedByUserId: user?.sub ?? null,
            changes,
          },
          tx,
        );
      }
      await this.leaseActivityRepo.create(
        {
          orgId,
          leaseId: updatedLease.id,
          action: LeaseActivityAction.MOVE_OUT,
          changedByUserId: user?.sub ?? null,
          payload: {
            occupancyId,
            actualMoveOutDate: actualMoveOutDate.toISOString(),
          },
        },
        tx,
      );

      return updatedLease;
    });

    return updated;
  }

  private async resolveResidentUser(
    tx: PrismaNamespace.TransactionClient,
    orgId: string,
    dto: MoveInDto,
  ) {
    if (dto.residentUserId) {
      const user = await tx.user.findFirst({
        where: { id: dto.residentUserId, orgId, isActive: true },
      });
      if (!user) {
        throw new NotFoundException('Resident user not found');
      }
      return user.id;
    }

    if (!dto.resident) {
      throw new BadRequestException('Resident details are required');
    }

    const email = normalizeEmail(dto.resident.email);
    const existing = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(
        describeEmailOwnershipConflict({
          existingOrgId: existing.orgId,
          targetOrgId: orgId,
        }),
      );
    }

    const password =
      (dto.resident.password?.trim().length ?? 0 > 0)
        ? dto.resident.password!.trim()
        : randomBytes(12).toString('base64url');
    const passwordHash = await argon2.hash(password);

    const created = await tx.user.create({
      data: {
        email,
        name: dto.resident.name.trim(),
        phone: dto.resident.phone?.trim() ?? null,
        passwordHash,
        orgId,
        mustChangePassword: true,
        isActive: true,
      },
    });

    return created.id;
  }

  private async lockUnit(
    tx: PrismaNamespace.TransactionClient,
    unitId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Unit" WHERE id = ${unitId} FOR UPDATE
    `;
    if (!rows.length) {
      throw new NotFoundException('Unit not found');
    }
  }

  private mapMoveInConstraintError(
    error: unknown,
    unitId: string,
    dto: MoveInDto,
  ) {
    const constraint = detectOccupancyConstraint(error);
    if (!constraint) {
      const fallback = mapOccupancyConstraintError(error);
      if (fallback) return fallback;
      return null;
    }

    const residentHint = dto.residentUserId
      ? ` for resident ${dto.residentUserId}`
      : '';
    if (constraint === 'unit') {
      return new ConflictException(
        `Unit already has an active occupancy (${unitId})`,
      );
    }
    if (constraint === 'resident') {
      return new ConflictException(
        `Resident already has an active occupancy${residentHint}`,
      );
    }
    if (constraint === 'status') {
      return new BadRequestException('Invalid occupancy state');
    }
    return null;
  }

  private normalizeNames(values: string[]) {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const raw of values) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(trimmed);
    }
    return deduped;
  }

  private async allocateParkingSlots(
    tx: PrismaNamespace.TransactionClient,
    orgId: string,
    buildingId: string,
    slotIds: string[],
    occupancyId: string,
    startDate: Date,
  ) {
    const slots = await this.parkingRepo.findManyByIds(
      orgId,
      buildingId,
      slotIds,
      tx,
    );
    if (slots.length !== slotIds.length) {
      throw new NotFoundException('Parking slot not found in org/building');
    }

    const active = await this.parkingRepo.findActiveAllocationsForSlots(
      slotIds,
      tx,
    );
    if (active.length > 0) {
      throw new ConflictException('Parking slot already allocated');
    }

    await tx.parkingAllocation.createMany({
      data: slotIds.map((slotId) => ({
        orgId,
        buildingId,
        parkingSlotId: slotId,
        occupancyId,
        startDate,
        endDate: null,
      })),
    });
  }
}

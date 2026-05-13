import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessItemStatus, LeaseActivityAction } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { CreateLeaseParkingStickersDto } from './dto/create-lease-parking-stickers.dto';
import { UpdateAccessItemStatusDto } from './dto/update-access-item-status.dto';
import { LeaseActivityRepo } from './lease-activity.repo';
import { LeaseParkingStickersRepo } from './lease-parking-stickers.repo';
import { LeasesRepo } from './leases.repo';

@Injectable()
export class LeaseParkingStickersService {
  constructor(
    private readonly leasesRepo: LeasesRepo,
    private readonly leaseParkingStickersRepo: LeaseParkingStickersRepo,
    private readonly leaseActivityRepo: LeaseActivityRepo,
  ) {}

  async list(user: AuthenticatedUser | undefined, leaseId: string) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);
    return this.leaseParkingStickersRepo.listByLeaseId(leaseId);
  }

  async create(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    dto: CreateLeaseParkingStickersDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);

    const uniqueNumbers = Array.from(
      new Set(dto.stickerNumbers.map((value) => value.trim()).filter(Boolean)),
    );
    if (
      uniqueNumbers.length !== dto.stickerNumbers.length ||
      uniqueNumbers.length === 0
    ) {
      throw new ConflictException('Duplicate sticker numbers in request');
    }

    const existing = await this.leaseParkingStickersRepo.findByNumbers(
      leaseId,
      uniqueNumbers,
    );
    if (existing.length > 0) {
      throw new ConflictException(
        'Sticker number already exists for this lease',
      );
    }

    await this.leaseParkingStickersRepo.createMany(
      leaseId,
      uniqueNumbers.map((stickerNumber) => ({ stickerNumber })),
    );
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.PARKING_STICKER_ISSUED,
      changedByUserId: user?.sub ?? null,
      payload: {
        stickerNumbers: uniqueNumbers,
        count: uniqueNumbers.length,
      },
    });

    return this.leaseParkingStickersRepo.listByLeaseId(leaseId);
  }

  async updateStatus(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    stickerId: string,
    dto: UpdateAccessItemStatusDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);

    const sticker = await this.leaseParkingStickersRepo.findById(
      leaseId,
      stickerId,
    );
    if (!sticker) {
      throw new NotFoundException('Parking sticker not found');
    }

    const nextStatus = dto.status;
    if (!this.isValidTransition(sticker.status, nextStatus)) {
      throw new BadRequestException(
        'Invalid parking sticker status transition',
      );
    }

    const returnedAt =
      nextStatus === AccessItemStatus.RETURNED
        ? (sticker.returnedAt ?? new Date())
        : nextStatus === AccessItemStatus.ISSUED
          ? null
          : (sticker.returnedAt ?? null);

    const updated = await this.leaseParkingStickersRepo.updateStatus(
      sticker.id,
      nextStatus,
      returnedAt,
    );
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.PARKING_STICKER_STATUS_CHANGED,
      changedByUserId: user?.sub ?? null,
      payload: {
        stickerId: sticker.id,
        stickerNumber: sticker.stickerNumber,
        from: sticker.status,
        to: nextStatus,
      },
    });
    return updated;
  }

  async delete(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    stickerId: string,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);

    const sticker = await this.leaseParkingStickersRepo.findById(
      leaseId,
      stickerId,
    );
    if (!sticker) {
      throw new NotFoundException('Parking sticker not found');
    }
    await this.leaseParkingStickersRepo.deleteById(sticker.id);
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.PARKING_STICKER_DELETED,
      changedByUserId: user?.sub ?? null,
      payload: {
        stickerId: sticker.id,
        stickerNumber: sticker.stickerNumber,
        status: sticker.status,
      },
    });
  }

  private async findLeaseOrThrow(orgId: string, leaseId: string) {
    const lease = await this.leasesRepo.findById(orgId, leaseId);
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  private isValidTransition(current: AccessItemStatus, next: AccessItemStatus) {
    if (current === next) {
      return true;
    }
    if (current === AccessItemStatus.ISSUED) {
      return (
        next === AccessItemStatus.RETURNED ||
        next === AccessItemStatus.DEACTIVATED
      );
    }
    if (current === AccessItemStatus.RETURNED) {
      return next === AccessItemStatus.DEACTIVATED;
    }
    return false;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessItemStatus, LeaseActivityAction } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { CreateLeaseAccessCardsDto } from './dto/create-lease-access-cards.dto';
import { UpdateAccessItemStatusDto } from './dto/update-access-item-status.dto';
import { LeaseAccessCardsRepo } from './lease-access-cards.repo';
import { LeaseActivityRepo } from './lease-activity.repo';
import { LeasesRepo } from './leases.repo';

@Injectable()
export class LeaseAccessCardsService {
  constructor(
    private readonly leasesRepo: LeasesRepo,
    private readonly leaseAccessCardsRepo: LeaseAccessCardsRepo,
    private readonly leaseActivityRepo: LeaseActivityRepo,
  ) {}

  async list(user: AuthenticatedUser | undefined, leaseId: string) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);
    return this.leaseAccessCardsRepo.listByLeaseId(leaseId);
  }

  async create(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    dto: CreateLeaseAccessCardsDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);

    const uniqueNumbers = Array.from(
      new Set(dto.cardNumbers.map((value) => value.trim()).filter(Boolean)),
    );
    if (
      uniqueNumbers.length !== dto.cardNumbers.length ||
      uniqueNumbers.length === 0
    ) {
      throw new ConflictException('Duplicate card numbers in request');
    }

    const existing = await this.leaseAccessCardsRepo.findByNumbers(
      leaseId,
      uniqueNumbers,
    );
    if (existing.length > 0) {
      throw new ConflictException('Card number already exists for this lease');
    }

    await this.leaseAccessCardsRepo.createMany(
      leaseId,
      uniqueNumbers.map((cardNumber) => ({ cardNumber })),
    );
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.ACCESS_CARD_ISSUED,
      changedByUserId: user?.sub ?? null,
      payload: {
        cardNumbers: uniqueNumbers,
        count: uniqueNumbers.length,
      },
    });

    return this.leaseAccessCardsRepo.listByLeaseId(leaseId);
  }

  async updateStatus(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    cardId: string,
    dto: UpdateAccessItemStatusDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);

    const card = await this.leaseAccessCardsRepo.findById(leaseId, cardId);
    if (!card) {
      throw new NotFoundException('Access card not found');
    }

    const nextStatus = dto.status;
    if (!this.isValidTransition(card.status, nextStatus)) {
      throw new BadRequestException('Invalid access card status transition');
    }

    const returnedAt =
      nextStatus === AccessItemStatus.RETURNED
        ? (card.returnedAt ?? new Date())
        : nextStatus === AccessItemStatus.ISSUED
          ? null
          : (card.returnedAt ?? null);

    const updated = await this.leaseAccessCardsRepo.updateStatus(
      card.id,
      nextStatus,
      returnedAt,
    );
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.ACCESS_CARD_STATUS_CHANGED,
      changedByUserId: user?.sub ?? null,
      payload: {
        cardId: card.id,
        cardNumber: card.cardNumber,
        from: card.status,
        to: nextStatus,
      },
    });
    return updated;
  }

  async delete(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    cardId: string,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);

    const card = await this.leaseAccessCardsRepo.findById(leaseId, cardId);
    if (!card) {
      throw new NotFoundException('Access card not found');
    }
    await this.leaseAccessCardsRepo.deleteById(card.id);
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.ACCESS_CARD_DELETED,
      changedByUserId: user?.sub ?? null,
      payload: {
        cardId: card.id,
        cardNumber: card.cardNumber,
        status: card.status,
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaseActivityAction } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { ReplaceLeaseOccupantsDto } from './dto/replace-lease-occupants.dto';
import { LeaseActivityRepo } from './lease-activity.repo';
import { LeaseOccupantsRepo } from './lease-occupants.repo';
import { LeasesRepo } from './leases.repo';

@Injectable()
export class LeaseOccupantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leasesRepo: LeasesRepo,
    private readonly leaseOccupantsRepo: LeaseOccupantsRepo,
    private readonly leaseActivityRepo: LeaseActivityRepo,
  ) {}

  async list(user: AuthenticatedUser | undefined, leaseId: string) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);
    return this.leaseOccupantsRepo.listByLeaseId(leaseId);
  }

  async replace(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    dto: ReplaceLeaseOccupantsDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);

    const cleanedNames = this.normalizeNames(dto.names);
    await this.prisma.$transaction(async (tx) => {
      await this.leaseOccupantsRepo.deleteByLeaseId(leaseId, tx);
      await this.leaseOccupantsRepo.createMany(leaseId, cleanedNames, tx);
    });
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.OCCUPANTS_REPLACED,
      changedByUserId: user?.sub ?? null,
      payload: {
        names: cleanedNames,
        count: cleanedNames.length,
      },
    });
    return this.leaseOccupantsRepo.listByLeaseId(leaseId);
  }

  private async findLeaseOrThrow(orgId: string, leaseId: string) {
    const lease = await this.leasesRepo.findById(orgId, leaseId);
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  private normalizeNames(names: string[]) {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const raw of names) {
      const trimmed = raw.trim();
      if (trimmed === '') {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(trimmed);
    }
    return deduped;
  }
}

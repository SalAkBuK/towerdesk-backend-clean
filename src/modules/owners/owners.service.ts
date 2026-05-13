import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { normalizeEmail } from '../users/user-identity.util';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { OwnerProvisioningService } from './owner-provisioning.service';
import { OwnersRepo } from './owners.repo';

@Injectable()
export class OwnersService {
  constructor(
    private readonly ownersRepo: OwnersRepo,
    private readonly ownerProvisioningService: OwnerProvisioningService,
  ) {}

  list(user: AuthenticatedUser | undefined, search?: string) {
    const orgId = assertOrgScope(user);
    return this.ownersRepo.list(orgId, search);
  }

  async create(user: AuthenticatedUser | undefined, dto: CreateOwnerDto) {
    const orgId = assertOrgScope(user);
    const created = await this.ownerProvisioningService.createOrReuseOwner({
      actorUserId: user?.sub ?? '',
      orgId,
      dto,
    });
    const owner = await this.ownersRepo.findByIdWithPartySummary(created.id);
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
    return owner;
  }

  async update(
    user: AuthenticatedUser | undefined,
    ownerId: string,
    dto: UpdateOwnerDto,
  ) {
    const orgId = assertOrgScope(user);
    const existing = await this.ownersRepo.findByIdWithPartySummary(ownerId);
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException('Owner not found');
    }

    await this.ownersRepo.update(ownerId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.email !== undefined
        ? { email: dto.email ? normalizeEmail(dto.email) : null }
        : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    const owner = await this.ownersRepo.findByIdWithPartySummary(ownerId);
    if (!owner || owner.orgId !== orgId) {
      throw new NotFoundException('Owner not found');
    }

    return owner;
  }
}

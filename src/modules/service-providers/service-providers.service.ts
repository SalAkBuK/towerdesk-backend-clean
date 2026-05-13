import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto';
import { UpdateServiceProviderDto } from './dto/update-service-provider.dto';
import { ServiceProvidersRepo } from './service-providers.repo';
import { ProviderAccessGrantService } from './provider-access-grant.service';

@Injectable()
export class ServiceProvidersService {
  constructor(
    private readonly serviceProvidersRepo: ServiceProvidersRepo,
    private readonly providerAccessGrantService: ProviderAccessGrantService,
  ) {}

  list(user: AuthenticatedUser | undefined, search?: string) {
    const orgId = assertOrgScope(user);
    return this.serviceProvidersRepo.list(orgId, this.normalizeQuery(search));
  }

  async getById(user: AuthenticatedUser | undefined, providerId: string) {
    const orgId = assertOrgScope(user);
    const provider = await this.serviceProvidersRepo.findByIdForOrg(
      providerId,
      orgId,
    );

    if (!provider) {
      throw new NotFoundException('Service provider not found');
    }

    return provider;
  }

  async create(
    user: AuthenticatedUser | undefined,
    dto: CreateServiceProviderDto,
  ) {
    const orgId = assertOrgScope(user);
    const actorUserId = user?.sub;
    if (!actorUserId) {
      throw new BadRequestException('User context required');
    }

    const buildingIds = this.normalizeBuildingIds(dto.buildingIds);
    for (const buildingId of buildingIds) {
      const building = await this.serviceProvidersRepo.findBuildingForOrg(
        orgId,
        buildingId,
      );
      if (!building) {
        throw new NotFoundException('Building not found');
      }
    }

    let provider = await this.serviceProvidersRepo.create(
      {
        name: this.normalizeRequiredText(dto.name, 'name'),
        serviceCategory: this.normalizeOptionalText(dto.serviceCategory),
        contactName: this.normalizeOptionalText(dto.contactName),
        contactEmail: this.normalizeOptionalText(dto.contactEmail),
        contactPhone: this.normalizeOptionalText(dto.contactPhone),
        notes: this.normalizeOptionalText(dto.notes),
        isActive: dto.isActive,
      },
      orgId,
    );

    for (const buildingId of buildingIds) {
      provider = await this.serviceProvidersRepo.linkBuilding(
        provider.id,
        buildingId,
        orgId,
      );
    }

    if (dto.adminEmail) {
      await this.providerAccessGrantService.createPendingInvite({
        actorUserId,
        orgId,
        providerId: provider.id,
        email: dto.adminEmail,
      });
      provider = await this.getById(user, provider.id);
    }

    return provider;
  }

  async update(
    user: AuthenticatedUser | undefined,
    providerId: string,
    dto: UpdateServiceProviderDto,
  ) {
    const orgId = assertOrgScope(user);
    const provider = await this.getById(user, providerId);
    const activeGrantCount =
      await this.serviceProvidersRepo.countActiveAccessGrants(provider.id);
    if (activeGrantCount > 0) {
      throw new ConflictException(
        'Provider profile is managed by provider admins after onboarding',
      );
    }

    return this.serviceProvidersRepo.update(
      provider.id,
      {
        ...(dto.name !== undefined
          ? { name: this.normalizeRequiredText(dto.name, 'name') }
          : {}),
        ...(dto.serviceCategory !== undefined
          ? {
              serviceCategory: this.normalizeOptionalText(dto.serviceCategory),
            }
          : {}),
        ...(dto.contactName !== undefined
          ? { contactName: this.normalizeOptionalText(dto.contactName) }
          : {}),
        ...(dto.contactEmail !== undefined
          ? { contactEmail: this.normalizeOptionalText(dto.contactEmail) }
          : {}),
        ...(dto.contactPhone !== undefined
          ? { contactPhone: this.normalizeOptionalText(dto.contactPhone) }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: this.normalizeOptionalText(dto.notes) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      orgId,
    );
  }

  async linkBuilding(
    user: AuthenticatedUser | undefined,
    providerId: string,
    buildingId: string,
  ) {
    const orgId = assertOrgScope(user);
    await this.getById(user, providerId);
    const building = await this.serviceProvidersRepo.findBuildingForOrg(
      orgId,
      buildingId,
    );

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    return this.serviceProvidersRepo.linkBuilding(
      providerId,
      building.id,
      orgId,
    );
  }

  async unlinkBuilding(
    user: AuthenticatedUser | undefined,
    providerId: string,
    buildingId: string,
  ) {
    const orgId = assertOrgScope(user);
    const provider = await this.getById(user, providerId);
    const existingLink = provider.buildings.find(
      (link) => link.buildingId === buildingId,
    );

    if (!existingLink) {
      throw new NotFoundException('Service provider building link not found');
    }

    return this.serviceProvidersRepo.unlinkBuilding(
      provider.id,
      buildingId,
      orgId,
    );
  }

  private normalizeRequiredText(value: string, fieldName: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return normalized;
  }

  private normalizeOptionalText(value?: string) {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeQuery(value?: string) {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeBuildingIds(value?: string[]) {
    if (!value) {
      return [];
    }

    return Array.from(
      new Set(
        value.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      ),
    );
  }
}

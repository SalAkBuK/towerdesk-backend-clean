import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ServiceProviderUserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AuthenticatedUser } from '../../common/types/request-context';
import { normalizeEmail } from '../users/user-identity.util';
import { ProviderAccessService } from './provider-access.service';
import { ServiceProvidersRepo } from './service-providers.repo';
import { UpdateServiceProviderDto } from './dto/update-service-provider.dto';
import { CreateProviderStaffDto } from './dto/create-provider-staff.dto';
import { UpdateProviderStaffDto } from './dto/update-provider-staff.dto';

@Injectable()
export class ProviderPortalService {
  constructor(
    private readonly serviceProvidersRepo: ServiceProvidersRepo,
    private readonly providerAccessService: ProviderAccessService,
  ) {}

  async getMe(user: AuthenticatedUser | undefined) {
    const userId = user?.sub;
    if (!userId) {
      throw new ForbiddenException('Forbidden');
    }

    const { memberships } =
      await this.providerAccessService.getAccessibleProviderContext(userId);

    return {
      userId,
      email: user?.email ?? null,
      providers: memberships.map((membership) => ({
        providerId: membership.serviceProviderId,
        role: membership.role,
        name: membership.serviceProvider.name,
        serviceCategory: membership.serviceProvider.serviceCategory ?? null,
        membershipIsActive: membership.isActive,
      })),
    };
  }

  async getProfile(user: AuthenticatedUser | undefined) {
    const membership = await this.requireProviderMembership(user);
    const provider = await this.serviceProvidersRepo.findPortalViewById(
      membership.serviceProviderId,
    );
    if (!provider) {
      throw new NotFoundException('Service provider not found');
    }
    return provider;
  }

  async updateProfile(
    user: AuthenticatedUser | undefined,
    dto: UpdateServiceProviderDto,
  ) {
    const membership = await this.requireProviderAdmin(user);

    return this.serviceProvidersRepo.updatePortalView(
      membership.serviceProviderId,
      {
        ...(dto.name !== undefined
          ? { name: this.normalizeRequiredText(dto.name, 'name') }
          : {}),
        ...(dto.serviceCategory !== undefined
          ? { serviceCategory: this.normalizeOptionalText(dto.serviceCategory) }
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
    );
  }

  async listStaff(user: AuthenticatedUser | undefined) {
    const membership = await this.requireProviderAdmin(user);
    return this.serviceProvidersRepo.listStaff(membership.serviceProviderId);
  }

  async createStaff(
    user: AuthenticatedUser | undefined,
    dto: CreateProviderStaffDto,
  ) {
    const membership = await this.requireProviderAdmin(user);
    const email = normalizeEmail(dto.email);

    const existing =
      await this.serviceProvidersRepo.findUserByEmailInsensitive(email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const tempPassword = this.generateTempPassword();
    const createdUser = await this.serviceProvidersRepo.createStandaloneUser({
      email,
      name: this.normalizeRequiredText(dto.name, 'name'),
      phone: this.normalizeOptionalText(dto.phone) ?? null,
      passwordHash: await argon2.hash(tempPassword),
      orgId: null,
      mustChangePassword: true,
      isActive: true,
    });

    const staff = await this.serviceProvidersRepo.upsertMembership(
      membership.serviceProviderId,
      createdUser.id,
      dto.role,
      dto.isActive ?? true,
    );

    return {
      staff,
      tempPassword,
    };
  }

  async updateStaff(
    user: AuthenticatedUser | undefined,
    staffUserId: string,
    dto: UpdateProviderStaffDto,
  ) {
    const adminMembership = await this.requireProviderAdmin(user);
    if (adminMembership.userId === staffUserId) {
      throw new ConflictException(
        'Provider admins cannot modify their own membership',
      );
    }

    const membership = await this.serviceProvidersRepo.findMembership(
      adminMembership.serviceProviderId,
      staffUserId,
    );
    if (!membership) {
      throw new NotFoundException('Provider staff user not found');
    }

    return this.serviceProvidersRepo.upsertMembership(
      adminMembership.serviceProviderId,
      staffUserId,
      dto.role ?? membership.role,
      dto.isActive ?? membership.isActive,
    );
  }

  private async requireProviderMembership(user: AuthenticatedUser | undefined) {
    const userId = user?.sub;
    if (!userId) {
      throw new ForbiddenException('Forbidden');
    }

    return this.providerAccessService.getSingleAccessibleMembership(userId);
  }

  private async requireProviderAdmin(user: AuthenticatedUser | undefined) {
    const membership = await this.requireProviderMembership(user);
    if (membership.role !== ServiceProviderUserRole.ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
    return membership;
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

  private generateTempPassword() {
    return randomBytes(12).toString('base64url');
  }
}

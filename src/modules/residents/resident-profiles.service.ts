import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { StorageService } from '../../infra/storage/storage.service';
import { ResidentProfilesRepo } from './resident-profiles.repo';
import { UpsertResidentProfileDto } from './dto/upsert-resident-profile.dto';

@Injectable()
export class ResidentProfilesService {
  private readonly residentAvatarMaxSizeBytes = 5 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly residentProfilesRepo: ResidentProfilesRepo,
    private readonly storageService: StorageService,
  ) {}

  async getByUserId(user: AuthenticatedUser | undefined, userId: string) {
    const orgId = assertOrgScope(user);
    await this.assertUserInOrg(orgId, userId);

    const profile = await this.getProfileWithUser(orgId, userId);
    if (!profile) {
      throw new NotFoundException('Resident profile not found');
    }
    return profile;
  }

  async getMyProfile(user: AuthenticatedUser | undefined) {
    const userId = user?.sub;
    if (!userId) {
      throw new NotFoundException('User not found');
    }
    return this.getByUserId(user, userId);
  }

  async upsertMyProfile(
    user: AuthenticatedUser | undefined,
    dto: UpsertResidentProfileDto,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new NotFoundException('User not found');
    }
    return this.upsertByUserId(user, userId, dto);
  }

  async upsertByUserId(
    user: AuthenticatedUser | undefined,
    userId: string,
    dto: UpsertResidentProfileDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.assertUserInOrg(orgId, userId);
    if (dto.preferredBuildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.preferredBuildingId, orgId },
        select: { id: true },
      });
      if (!building) {
        throw new NotFoundException('Preferred building not found');
      }
    }

    await this.residentProfilesRepo.upsertByUserId(orgId, userId, {
      ...(dto.emiratesIdNumber !== undefined
        ? { emiratesIdNumber: dto.emiratesIdNumber }
        : {}),
      ...(dto.passportNumber !== undefined
        ? { passportNumber: dto.passportNumber }
        : {}),
      ...(dto.nationality !== undefined
        ? { nationality: dto.nationality }
        : {}),
      ...(dto.dateOfBirth !== undefined
        ? { dateOfBirth: new Date(dto.dateOfBirth) }
        : {}),
      ...(dto.currentAddress !== undefined
        ? { currentAddress: dto.currentAddress }
        : {}),
      ...(dto.emergencyContactName !== undefined
        ? { emergencyContactName: dto.emergencyContactName }
        : {}),
      ...(dto.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: dto.emergencyContactPhone }
        : {}),
      ...(dto.preferredBuildingId !== undefined
        ? { preferredBuildingId: dto.preferredBuildingId }
        : {}),
    });

    const profile = await this.getProfileWithUser(orgId, userId);
    if (!profile) {
      throw new NotFoundException('Resident profile not found');
    }
    return profile;
  }

  async uploadMyAvatar(
    user: AuthenticatedUser | undefined,
    file:
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
          size?: number;
        }
      | undefined,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }

    const mimeType = file.mimetype?.trim().toLowerCase() ?? '';
    if (!this.isAllowedAvatarMimeType(mimeType)) {
      throw new BadRequestException('Unsupported avatar file type');
    }

    const sizeBytes = file.size ?? file.buffer.length;
    if (sizeBytes > this.residentAvatarMaxSizeBytes) {
      throw new BadRequestException(
        `File size exceeds ${this.residentAvatarMaxSizeBytes} bytes`,
      );
    }

    const residentUser = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
      select: { id: true },
    });
    if (!residentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    const safeFileName = this.sanitizeFileName(file.originalname ?? 'avatar');
    const objectKey = [
      'avatars',
      orgId,
      userId,
      `${Date.now()}-${randomUUID()}-${safeFileName}`,
    ].join('/');

    await this.storageService.putObject({
      key: objectKey,
      body: file.buffer,
      contentType: mimeType,
    });

    const avatarUrl = this.storageService.getPublicUrl({ key: objectKey });
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl };
  }

  private async assertUserInOrg(orgId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private getProfileWithUser(orgId: string, userId: string) {
    return this.prisma.residentProfile.findFirst({
      where: { orgId, userId },
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
  }

  private sanitizeFileName(fileName: string) {
    const trimmed = fileName.trim();
    if (!trimmed) {
      return 'avatar';
    }

    const compact = trimmed
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    return compact.slice(0, 120) || 'avatar';
  }

  private isAllowedAvatarMimeType(mimeType: string) {
    return new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']).has(
      mimeType,
    );
  }
}

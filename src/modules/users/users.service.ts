import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { StorageService } from '../../infra/storage/storage.service';
import { UsersRepo } from './users.repo';
import { CreateOrgUserDto } from './dto/create-org-user.dto';
import { OrgUserLifecycleService } from './org-user-lifecycle.service';

@Injectable()
export class UsersService {
  private readonly avatarMaxSizeBytes = 5 * 1024 * 1024;

  constructor(
    private readonly usersRepo: UsersRepo,
    private readonly orgUserLifecycleService: OrgUserLifecycleService,
    private readonly storageService: StorageService,
  ) {}

  async findById(id: string) {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.orgUserLifecycleService.buildUserResponse(
      user,
      user.orgId ?? null,
    );
  }

  async findByIdInOrg(user: AuthenticatedUser | undefined, id: string) {
    const orgId = assertOrgScope(user);
    return this.orgUserLifecycleService.buildUserResponseInOrg(id, orgId);
  }

  async listInOrg(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    return this.orgUserLifecycleService.listUserResponsesInOrg(orgId);
  }

  async updateProfile(
    id: string,
    data: { name?: string; avatarUrl?: string; phone?: string },
  ) {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.usersRepo.updateProfile(id, data);
    return this.orgUserLifecycleService.buildUserResponse(
      updated,
      updated.orgId ?? null,
    );
  }

  async uploadMyAvatar(
    user:
      | {
          sub?: string;
        }
      | undefined,
    file:
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
          size?: number;
        }
      | undefined,
  ) {
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
    if (sizeBytes > this.avatarMaxSizeBytes) {
      throw new BadRequestException(
        `File size exceeds ${this.avatarMaxSizeBytes} bytes`,
      );
    }

    const existingUser = await this.usersRepo.findById(userId);
    if (!existingUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    const objectKey = [
      'avatars',
      existingUser.orgId ?? 'unscoped',
      existingUser.id,
      `${Date.now()}-${randomUUID()}-${this.sanitizeFileName(file.originalname ?? 'avatar')}`,
    ].join('/');

    await this.storageService.putObject({
      key: objectKey,
      body: file.buffer,
      contentType: mimeType,
    });

    const avatarUrl = this.storageService.getPublicUrl({ key: objectKey });
    await this.usersRepo.updateProfile(userId, { avatarUrl });

    return { avatarUrl };
  }

  async createInOrg(
    user: AuthenticatedUser | undefined,
    dto: CreateOrgUserDto,
  ) {
    const orgId = assertOrgScope(user);
    const created = await this.orgUserLifecycleService.provisionOrgUser({
      actor: user,
      orgId,
      identity: {
        email: dto.email,
        name: dto.name,
        password: dto.password,
      },
      accessAssignments:
        dto.roleKeys?.map((roleTemplateKey) => ({
          roleTemplateKey,
          scopeType: 'ORG' as const,
          scopeId: null,
        })) ?? [],
      allowGeneratedPasswordWithoutInvite: true,
      mode: { ifEmailExists: 'ERROR', requireSameOrg: true },
    });

    return {
      userId: created.user.id,
      email: created.user.email,
      tempPassword: created.generatedPassword,
      mustChangePassword: true,
    };
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { OwnerAccessGrantStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { normalizeEmail } from '../users/user-identity.util';
import { UpdateUserProfileDto } from '../users/dto/update-user-profile.dto';
import {
  OwnerAccessibleProfileResponseDto,
  OwnerMeResponseDto,
} from './dto/owner-me.response.dto';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';

@Injectable()
export class OwnerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<OwnerMeResponseDto> {
    const [user, grants] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          phone: true,
        },
      }),
      this.prisma.ownerAccessGrant.findMany({
        where: {
          userId,
          status: OwnerAccessGrantStatus.ACTIVE,
          owner: {
            isActive: true,
          },
        },
        select: {
          ownerId: true,
          owner: {
            select: {
              id: true,
              orgId: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              isActive: true,
              org: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ owner: { org: { name: 'asc' } } }, { ownerId: 'asc' }],
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const owners = new Map<string, OwnerAccessibleProfileResponseDto>();
    for (const grant of grants) {
      if (!owners.has(grant.ownerId)) {
        owners.set(grant.ownerId, {
          ownerId: grant.owner.id,
          orgId: grant.owner.org.id,
          orgName: grant.owner.org.name,
          name: grant.owner.name,
          email: grant.owner.email ?? null,
          phone: grant.owner.phone ?? null,
          address: grant.owner.address ?? null,
          isActive: grant.owner.isActive,
        });
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        avatarUrl: user.avatarUrl ?? null,
        phone: user.phone ?? null,
      },
      owners: Array.from(owners.values()),
    };
  }

  async updateAccountProfile(userId: string, dto: UpdateUserProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        phone: true,
      },
    });
  }

  async updateOwnerProfile(
    userId: string,
    ownerId: string,
    dto: UpdateOwnerProfileDto,
  ): Promise<OwnerAccessibleProfileResponseDto> {
    const accessible = await this.prisma.ownerAccessGrant.findFirst({
      where: {
        userId,
        ownerId,
        status: OwnerAccessGrantStatus.ACTIVE,
        owner: {
          isActive: true,
        },
      },
      select: {
        ownerId: true,
      },
    });

    if (!accessible) {
      throw new NotFoundException('Owner profile not found');
    }

    const data: Prisma.OwnerUpdateInput = {};
    if (dto.email !== undefined) {
      data.email = dto.email ? normalizeEmail(dto.email) : null;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone ?? null;
    }
    if (dto.address !== undefined) {
      data.address = dto.address ?? null;
    }

    const updated = await this.prisma.owner.update({
      where: { id: ownerId },
      data,
      select: {
        id: true,
        orgId: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        org: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      ownerId: updated.id,
      orgId: updated.org.id,
      orgName: updated.org.name,
      name: updated.name,
      email: updated.email ?? null,
      phone: updated.phone ?? null,
      address: updated.address ?? null,
      isActive: updated.isActive,
    };
  }
}

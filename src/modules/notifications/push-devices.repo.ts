import { Injectable } from '@nestjs/common';
import {
  OwnerAccessGrantStatus,
  PushPlatform,
  PushProvider,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class PushDevicesRepo {
  constructor(private readonly prisma: PrismaService) {}

  register(input: {
    orgId?: string | null;
    userId: string;
    provider: PushProvider;
    platform?: PushPlatform;
    token: string;
    deviceId?: string;
    appId?: string;
  }) {
    return this.prisma.pushDevice.upsert({
      where: { token: input.token },
      update: {
        orgId: input.orgId ?? null,
        userId: input.userId,
        provider: input.provider,
        platform: input.platform ?? PushPlatform.UNKNOWN,
        deviceId: input.deviceId ?? null,
        appId: input.appId ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        orgId: input.orgId ?? null,
        userId: input.userId,
        provider: input.provider,
        platform: input.platform ?? PushPlatform.UNKNOWN,
        token: input.token,
        deviceId: input.deviceId ?? null,
        appId: input.appId ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  findByIdForUser(deviceId: string, userId: string) {
    return this.prisma.pushDevice.findFirst({
      where: {
        id: deviceId,
        userId,
      },
    });
  }

  updateForUser(
    deviceId: string,
    userId: string,
    input: {
      orgId?: string | null;
      provider: PushProvider;
      platform?: PushPlatform;
      token: string;
      deviceId?: string;
      appId?: string;
    },
  ) {
    return this.prisma.pushDevice.update({
      where: { id: deviceId },
      data: {
        userId,
        orgId: input.orgId ?? null,
        provider: input.provider,
        platform: input.platform ?? PushPlatform.UNKNOWN,
        token: input.token,
        deviceId: input.deviceId ?? null,
        appId: input.appId ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async deactivateForUser(
    orgId: string | null | undefined,
    userId: string,
    token: string,
  ) {
    const result = await this.prisma.pushDevice.updateMany({
      where: {
        userId,
        token,
        ...(orgId === undefined ? {} : { orgId: orgId ?? null }),
      },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    return result.count;
  }

  async deactivateByIdForUser(deviceId: string, userId: string) {
    const result = await this.prisma.pushDevice.updateMany({
      where: { id: deviceId, userId },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    return result.count;
  }

  listActiveForAudience(orgId: string, userIds: string[]) {
    return this.prisma.pushDevice.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        user: {
          isActive: true,
          OR: [
            { orgId },
            {
              ownerAccessGrants: {
                some: {
                  status: OwnerAccessGrantStatus.ACTIVE,
                  owner: {
                    orgId,
                    isActive: true,
                  },
                },
              },
            },
          ],
        },
      },
    });
  }

  async deactivateTokens(tokens: string[]) {
    if (tokens.length === 0) {
      return 0;
    }

    const result = await this.prisma.pushDevice.updateMany({
      where: { token: { in: tokens } },
      data: { isActive: false },
    });

    return result.count;
  }

  async deactivateByIds(ids: string[]) {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.prisma.pushDevice.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    });

    return result.count;
  }
}

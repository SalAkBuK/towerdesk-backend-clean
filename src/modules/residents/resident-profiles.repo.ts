import { Injectable } from '@nestjs/common';
import { ResidentProfile } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

type ResidentProfileData = {
  emiratesIdNumber?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  dateOfBirth?: Date | null;
  currentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  preferredBuildingId?: string | null;
};

@Injectable()
export class ResidentProfilesRepo {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: DbClient) {
    return tx ?? this.prisma;
  }

  findByUserId(
    orgId: string,
    userId: string,
    tx?: DbClient,
  ): Promise<ResidentProfile | null> {
    const prisma = this.client(tx);
    return prisma.residentProfile.findFirst({
      where: { orgId, userId },
    });
  }

  upsertByUserId(
    orgId: string,
    userId: string,
    data: ResidentProfileData,
    tx?: DbClient,
  ): Promise<ResidentProfile> {
    const prisma = this.client(tx);
    return prisma.residentProfile.upsert({
      where: { userId },
      update: data,
      create: {
        orgId,
        userId,
        ...data,
      },
    });
  }
}

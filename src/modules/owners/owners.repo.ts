import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export const ownerWithPartySummaryArgs =
  Prisma.validator<Prisma.OwnerDefaultArgs>()({
    include: {
      party: {
        select: {
          id: true,
          type: true,
          displayNameEn: true,
          displayNameAr: true,
          identifiers: {
            where: {
              deletedAt: null,
            },
            orderBy: [
              { isPrimary: 'desc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            take: 1,
            select: {
              identifierType: true,
              last4: true,
              countryCode: true,
              issuingAuthority: true,
            },
          },
        },
      },
    },
  });

export type OwnerWithPartySummary = Prisma.OwnerGetPayload<
  typeof ownerWithPartySummaryArgs
>;

@Injectable()
export class OwnersRepo {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string, search?: string): Promise<OwnerWithPartySummary[]> {
    return this.prisma.owner.findMany({
      ...ownerWithPartySummaryArgs,
      where: {
        orgId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdWithPartySummary(id: string): Promise<OwnerWithPartySummary | null> {
    return this.prisma.owner.findUnique({
      ...ownerWithPartySummaryArgs,
      where: { id },
    });
  }

  update(
    id: string,
    data: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.prisma.owner.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  create(
    orgId: string,
    data: {
      partyId?: string | null;
      name: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      isActive?: boolean;
      displayNameOverride?: string | null;
      contactEmailOverride?: string | null;
      contactPhoneOverride?: string | null;
      notes?: string | null;
    },
  ) {
    return this.prisma.owner.create({
      data: {
        orgId,
        partyId: data.partyId ?? null,
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        isActive: data.isActive ?? true,
        displayNameOverride: data.displayNameOverride ?? null,
        contactEmailOverride: data.contactEmailOverride ?? null,
        contactPhoneOverride: data.contactPhoneOverride ?? null,
        notes: data.notes ?? null,
      },
    });
  }
}

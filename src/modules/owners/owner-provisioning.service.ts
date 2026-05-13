import { BadRequestException, Injectable } from '@nestjs/common';
import { PartyType } from '@prisma/client';
import { normalizeEmail } from '../users/user-identity.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PartyResolutionService } from '../parties/party-resolution.service';
import { PartyResolutionTokenService } from '../parties/party-resolution-token.service';
import { CreateOwnerDto } from './dto/create-owner.dto';

@Injectable()
export class OwnerProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partyResolutionService: PartyResolutionService,
    private readonly resolutionTokenService: PartyResolutionTokenService,
  ) {}

  async createOrReuseOwner(input: {
    actorUserId: string;
    orgId: string;
    dto: CreateOwnerDto;
  }) {
    const displayNameEn =
      input.dto.displayNameEn?.trim() || input.dto.name.trim();
    if (!displayNameEn) {
      throw new BadRequestException('Owner name is required');
    }

    const primaryEmail =
      input.dto.email !== undefined ? normalizeEmail(input.dto.email) : null;
    const primaryPhone = input.dto.phone?.trim() || null;

    let partyId: string;
    if (input.dto.resolutionToken) {
      const tokenPayload = await this.resolutionTokenService.verify(
        input.dto.resolutionToken,
        input.actorUserId,
        input.orgId,
      );
      partyId = tokenPayload.partyId;
    } else if (input.dto.identifier) {
      const resolved =
        await this.partyResolutionService.findPartyByIdentifierExact(
          { userId: input.actorUserId, orgId: input.orgId },
          {
            identifierType: input.dto.identifier.type,
            identifierValue: input.dto.identifier.value,
            countryCode: input.dto.identifier.countryCode,
            issuingAuthority: input.dto.identifier.issuingAuthority,
          },
        );

      if (resolved.party) {
        partyId = resolved.party.id;
      } else {
        const party = await this.prisma.$transaction(async (tx) => {
          const createdParty = await this.partyResolutionService.createParty(
            {
              type: input.dto.partyType ?? PartyType.INDIVIDUAL,
              displayNameEn,
              displayNameAr: input.dto.displayNameAr ?? null,
              primaryEmail,
              primaryPhone,
            },
            tx,
          );
          await this.partyResolutionService.createIdentifier(
            createdParty.id,
            {
              identifierType: input.dto.identifier!.type,
              identifierValue: input.dto.identifier!.value,
              countryCode: input.dto.identifier!.countryCode,
              issuingAuthority: input.dto.identifier!.issuingAuthority,
            },
            tx,
          );
          return createdParty;
        });
        partyId = party.id;
      }
    } else {
      const party = await this.partyResolutionService.createParty({
        type: input.dto.partyType ?? PartyType.INDIVIDUAL,
        displayNameEn,
        displayNameAr: input.dto.displayNameAr ?? null,
        primaryEmail,
        primaryPhone,
      });
      partyId = party.id;
    }

    const existingOwner = await this.prisma.owner.findFirst({
      where: { orgId: input.orgId, partyId },
    });

    const ownerData = {
      name: input.dto.name.trim(),
      email: primaryEmail,
      phone: primaryPhone,
      address: input.dto.address?.trim() || null,
      displayNameOverride:
        input.dto.ownerOverrides?.displayNameOverride?.trim() || null,
      contactEmailOverride:
        input.dto.ownerOverrides?.contactEmailOverride !== undefined
          ? normalizeEmail(input.dto.ownerOverrides.contactEmailOverride)
          : null,
      contactPhoneOverride:
        input.dto.ownerOverrides?.contactPhoneOverride?.trim() || null,
      notes: input.dto.ownerOverrides?.notes?.trim() || null,
      isActive: true,
    };

    if (existingOwner) {
      return this.prisma.owner.update({
        where: { id: existingOwner.id },
        data: ownerData,
      });
    }

    return this.prisma.owner.create({
      data: {
        orgId: input.orgId,
        partyId,
        ...ownerData,
      },
    });
  }
}

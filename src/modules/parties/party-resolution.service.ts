import { BadRequestException, Injectable } from '@nestjs/common';
import { PartyIdentifierType, PartyType, Prisma } from '@prisma/client';
import { DbClient } from '../../infra/prisma/db-client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PartyIdentifierService } from './party-identifier.service';

type IdentifierInput = {
  identifierType: PartyIdentifierType;
  identifierValue: string;
  countryCode?: string | null;
  issuingAuthority?: string | null;
};

@Injectable()
export class PartyResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partyIdentifierService: PartyIdentifierService,
  ) {}

  async findPartyByIdentifierExact(
    actor: { userId: string; orgId: string },
    input: IdentifierInput,
  ) {
    this.assertStrongIdentifier(input.identifierType);

    const prepared = this.partyIdentifierService.createStoredIdentifierData(
      input.identifierType,
      input.identifierValue,
      {
        countryCode: input.countryCode,
        issuingAuthority: input.issuingAuthority,
      },
    );

    const identifier = await this.prisma.partyIdentifier.findFirst({
      where: {
        identifierType: input.identifierType,
        countryCode: prepared.countryCode,
        issuingAuthority: prepared.issuingAuthority,
        lookupHmac: prepared.lookupHmac,
        deletedAt: null,
      },
      include: {
        party: true,
      },
    });

    await this.prisma.ownerRegistryLookupAudit.create({
      data: {
        actorUserId: actor.userId,
        actorOrgId: actor.orgId,
        identifierType: input.identifierType,
        lookupHmac: prepared.lookupHmac,
        resultStatus: identifier ? 'MATCH_FOUND' : 'NO_MATCH',
        matchedPartyId: identifier?.partyId ?? null,
      },
    });

    return {
      matchFound: Boolean(identifier),
      party: identifier?.party ?? null,
      lookupHmac: prepared.lookupHmac,
      maskedIdentifier: this.partyIdentifierService.maskIdentifier(
        input.identifierType,
        prepared.normalizedValue,
      ),
      normalizedContext: {
        countryCode: prepared.countryCode,
        issuingAuthority: prepared.issuingAuthority,
      },
    };
  }

  createParty(
    input: {
      type: PartyType;
      displayNameEn: string;
      displayNameAr?: string | null;
      primaryEmail?: string | null;
      primaryPhone?: string | null;
    },
    tx?: DbClient,
  ) {
    const prisma = tx ?? this.prisma;
    return prisma.party.create({
      data: {
        type: input.type,
        displayNameEn: input.displayNameEn,
        displayNameAr: input.displayNameAr ?? null,
        primaryEmail: input.primaryEmail ?? null,
        primaryPhone: input.primaryPhone ?? null,
      },
    });
  }

  createIdentifier(partyId: string, input: IdentifierInput, tx?: DbClient) {
    const prisma = tx ?? this.prisma;
    const prepared = this.partyIdentifierService.createStoredIdentifierData(
      input.identifierType,
      input.identifierValue,
      {
        countryCode: input.countryCode,
        issuingAuthority: input.issuingAuthority,
      },
    );

    return prisma.partyIdentifier.create({
      data: {
        partyId,
        identifierType: input.identifierType,
        countryCode: prepared.countryCode,
        issuingAuthority: prepared.issuingAuthority,
        valueEncrypted: prepared.valueEncrypted,
        lookupHmac: prepared.lookupHmac,
        last4: prepared.last4,
        normalizationVersion: prepared.normalizationVersion,
        isPrimary: true,
      },
    });
  }

  updatePartyBasics(
    partyId: string,
    input: {
      displayNameEn: string;
      displayNameAr?: string | null;
      primaryEmail?: string | null;
      primaryPhone?: string | null;
    },
    tx?: DbClient,
  ) {
    const prisma = tx ?? this.prisma;
    return prisma.party.update({
      where: { id: partyId },
      data: {
        displayNameEn: input.displayNameEn,
        displayNameAr: input.displayNameAr ?? null,
        ...(input.primaryEmail !== undefined
          ? { primaryEmail: input.primaryEmail ?? null }
          : {}),
        ...(input.primaryPhone !== undefined
          ? { primaryPhone: input.primaryPhone ?? null }
          : {}),
      },
    });
  }

  buildPartyCreateInput(input: {
    partyType?: PartyType;
    displayNameEn: string;
    displayNameAr?: string | null;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
  }) {
    return {
      type: input.partyType ?? PartyType.INDIVIDUAL,
      displayNameEn: input.displayNameEn,
      displayNameAr: input.displayNameAr ?? null,
      primaryEmail: input.primaryEmail ?? null,
      primaryPhone: input.primaryPhone ?? null,
    } satisfies Prisma.PartyUncheckedCreateInput;
  }

  private assertStrongIdentifier(identifierType: PartyIdentifierType) {
    if (identifierType === PartyIdentifierType.OTHER) {
      throw new BadRequestException(
        'Only strong identifier types are allowed for resolution',
      );
    }
  }
}

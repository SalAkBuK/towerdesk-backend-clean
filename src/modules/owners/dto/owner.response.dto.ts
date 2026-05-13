import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyIdentifierType, PartyType } from '@prisma/client';
import { OwnerWithPartySummary } from '../owners.repo';

class OwnerIdentifierSummaryDto {
  @ApiProperty({ enum: PartyIdentifierType })
  type!: PartyIdentifierType;

  @ApiPropertyOptional({ nullable: true })
  maskedValue?: string | null;

  @ApiPropertyOptional({ nullable: true })
  countryCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  issuingAuthority?: string | null;
}

class OwnerPartySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PartyType })
  type!: PartyType;

  @ApiProperty()
  displayNameEn!: string;

  @ApiPropertyOptional({ nullable: true })
  displayNameAr?: string | null;
}

export class OwnerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiPropertyOptional({ nullable: true })
  partyId?: string | null;

  @ApiPropertyOptional({ type: OwnerPartySummaryDto, nullable: true })
  party?: OwnerPartySummaryDto | null;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiPropertyOptional()
  address?: string | null;

  @ApiPropertyOptional({ type: OwnerIdentifierSummaryDto, nullable: true })
  identifier?: OwnerIdentifierSummaryDto | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

const toMaskedIdentifier = (last4?: string | null) =>
  last4 ? `***${last4}` : null;

export const toOwnerResponse = (
  owner: NonNullable<OwnerWithPartySummary>,
): OwnerResponseDto => ({
  id: owner.id,
  orgId: owner.orgId,
  partyId: owner.partyId ?? null,
  party: owner.party
    ? {
        id: owner.party.id,
        type: owner.party.type,
        displayNameEn: owner.party.displayNameEn,
        displayNameAr: owner.party.displayNameAr ?? null,
      }
    : null,
  name: owner.name,
  email: owner.email ?? null,
  phone: owner.phone ?? null,
  address: owner.address ?? null,
  identifier: owner.party?.identifiers[0]
    ? {
        type: owner.party.identifiers[0].identifierType,
        maskedValue: toMaskedIdentifier(owner.party.identifiers[0].last4),
        countryCode: owner.party.identifiers[0].countryCode ?? null,
        issuingAuthority: owner.party.identifiers[0].issuingAuthority ?? null,
      }
    : null,
  isActive: owner.isActive,
  createdAt: owner.createdAt,
  updatedAt: owner.updatedAt,
});

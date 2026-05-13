import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Lease,
  LeaseStatus,
  PaymentFrequency,
  PropertyUsage,
  UnitSizeUnit,
  FurnishedStatus,
} from '@prisma/client';

type ContractWithRelations = Lease & {
  unit?: {
    id: string;
    label: string;
    floor?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    unitSize?: unknown | null;
    unitSizeUnit?: UnitSizeUnit | null;
    furnishedStatus?: FurnishedStatus | null;
    unitType?: { id: string; name: string } | null;
  } | null;
  occupancy?: {
    residentUser?: {
      id: string;
      name?: string | null;
      email: string;
      phone?: string | null;
    } | null;
  } | null;
  residentUser?: {
    id: string;
    name?: string | null;
    email: string;
    phone?: string | null;
  } | null;
  additionalTerms?: { id: string; termText: string }[];
};

export const contractDisplayStatusValues = [
  LeaseStatus.DRAFT,
  LeaseStatus.ACTIVE,
  LeaseStatus.ENDED,
  LeaseStatus.CANCELLED,
  'MOVED_OUT',
] as const;

export type ContractDisplayStatus =
  (typeof contractDisplayStatusValues)[number];

class ContractResidentDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;
}

class ContractUnitTypeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

class ContractUnitDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ nullable: true })
  floor?: number | null;

  @ApiPropertyOptional({ nullable: true })
  bedrooms?: number | null;

  @ApiPropertyOptional({ nullable: true })
  bathrooms?: number | null;

  @ApiPropertyOptional({ nullable: true })
  unitSize?: unknown | null;

  @ApiPropertyOptional({ enum: UnitSizeUnit, nullable: true })
  unitSizeUnit?: UnitSizeUnit | null;

  @ApiPropertyOptional({ enum: FurnishedStatus, nullable: true })
  furnishedStatus?: FurnishedStatus | null;

  @ApiPropertyOptional({ type: ContractUnitTypeDto, nullable: true })
  unitType?: ContractUnitTypeDto | null;
}

export class ContractResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiPropertyOptional({ nullable: true })
  occupancyId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  residentUserId?: string | null;

  @ApiProperty({ enum: LeaseStatus })
  status!: LeaseStatus;

  @ApiProperty({ enum: contractDisplayStatusValues })
  displayStatus!: ContractDisplayStatus;

  @ApiProperty()
  contractPeriodFrom!: Date;

  @ApiProperty()
  contractPeriodTo!: Date;

  @ApiPropertyOptional({ nullable: true })
  ijariId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  contractDate?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  actualMoveOutDate?: Date | null;

  @ApiPropertyOptional({ enum: PropertyUsage, nullable: true })
  propertyUsage?: PropertyUsage | null;

  @ApiProperty()
  annualRent!: unknown;

  @ApiProperty({ enum: PaymentFrequency })
  paymentFrequency!: PaymentFrequency;

  @ApiPropertyOptional({ nullable: true })
  numberOfCheques?: number | null;

  @ApiProperty()
  securityDepositAmount!: unknown;

  @ApiPropertyOptional({ nullable: true })
  contractValue?: unknown | null;

  @ApiPropertyOptional({ nullable: true })
  paymentModeText?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ownerNameSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  landlordNameSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  tenantNameSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  tenantEmailSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  landlordEmailSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  tenantPhoneSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  landlordPhoneSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  buildingNameSnapshot?: string | null;

  @ApiPropertyOptional({ nullable: true })
  locationCommunity?: string | null;

  @ApiPropertyOptional({ nullable: true })
  propertySizeSqm?: unknown | null;

  @ApiPropertyOptional({ nullable: true })
  propertyTypeLabel?: string | null;

  @ApiPropertyOptional({ nullable: true })
  propertyNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  premisesNoDewa?: string | null;

  @ApiPropertyOptional({ nullable: true })
  plotNo?: string | null;

  @ApiProperty({ type: [String] })
  additionalTerms!: string[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: ContractResidentDto, nullable: true })
  resident?: ContractResidentDto | null;

  @ApiPropertyOptional({ type: ContractUnitDto, nullable: true })
  unit?: ContractUnitDto | null;
}

export const toContractResponse = (
  contract: ContractWithRelations,
): ContractResponseDto => {
  const resident =
    contract.residentUser ?? contract.occupancy?.residentUser ?? null;
  const displayStatus = getContractDisplayStatus(contract);

  return {
    id: contract.id,
    orgId: contract.orgId,
    buildingId: contract.buildingId,
    unitId: contract.unitId,
    occupancyId: contract.occupancyId ?? null,
    residentUserId: contract.residentUserId ?? null,
    status: contract.status,
    displayStatus,
    contractPeriodFrom: contract.leaseStartDate,
    contractPeriodTo: contract.leaseEndDate,
    ijariId: contract.ijariId ?? null,
    contractDate: contract.contractDate ?? null,
    actualMoveOutDate: contract.actualMoveOutDate ?? null,
    propertyUsage: contract.propertyUsage ?? null,
    annualRent: contract.annualRent,
    paymentFrequency: contract.paymentFrequency,
    numberOfCheques: contract.numberOfCheques ?? null,
    securityDepositAmount: contract.securityDepositAmount,
    contractValue: contract.contractValue ?? null,
    paymentModeText: contract.paymentModeText ?? null,
    ownerNameSnapshot: contract.ownerNameSnapshot ?? null,
    landlordNameSnapshot: contract.landlordNameSnapshot ?? null,
    tenantNameSnapshot: contract.tenantNameSnapshot ?? null,
    tenantEmailSnapshot: contract.tenantEmailSnapshot ?? null,
    landlordEmailSnapshot: contract.landlordEmailSnapshot ?? null,
    tenantPhoneSnapshot: contract.tenantPhoneSnapshot ?? null,
    landlordPhoneSnapshot: contract.landlordPhoneSnapshot ?? null,
    buildingNameSnapshot: contract.buildingNameSnapshot ?? null,
    locationCommunity: contract.locationCommunity ?? null,
    propertySizeSqm: contract.propertySizeSqm ?? null,
    propertyTypeLabel: contract.propertyTypeLabel ?? null,
    propertyNumber: contract.propertyNumber ?? null,
    premisesNoDewa: contract.premisesNoDewa ?? null,
    plotNo: contract.plotNo ?? null,
    additionalTerms:
      contract.additionalTerms?.map((term) => term.termText) ?? [],
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    resident: resident
      ? {
          id: resident.id,
          name: resident.name ?? null,
          email: resident.email,
          phone: resident.phone ?? null,
        }
      : null,
    unit: contract.unit
      ? {
          id: contract.unit.id,
          label: contract.unit.label,
          floor: contract.unit.floor ?? null,
          bedrooms: contract.unit.bedrooms ?? null,
          bathrooms: contract.unit.bathrooms ?? null,
          unitSize: contract.unit.unitSize ?? null,
          unitSizeUnit: contract.unit.unitSizeUnit ?? null,
          furnishedStatus: contract.unit.furnishedStatus ?? null,
          unitType: contract.unit.unitType
            ? {
                id: contract.unit.unitType.id,
                name: contract.unit.unitType.name,
              }
            : null,
        }
      : null,
  };
};

const getContractDisplayStatus = (
  contract: Pick<ContractWithRelations, 'status' | 'actualMoveOutDate'>,
): ContractDisplayStatus => {
  if (contract.status === LeaseStatus.CANCELLED && contract.actualMoveOutDate) {
    return 'MOVED_OUT';
  }
  if (contract.status === LeaseStatus.ENDED) {
    return 'MOVED_OUT';
  }
  return contract.status;
};

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalStatus,
  ConditionStatus,
  Lease,
  LeaseStatus,
  PaymentFrequency,
  RefundMethod,
  ServiceChargesPaidBy,
  UnitSizeUnit,
  FurnishedStatus,
  YesNo,
} from '@prisma/client';
type LeaseWithRelations = Lease & {
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
    residentUser?: { id: string; name?: string | null; email: string } | null;
  } | null;
  residentUser?: { id: string; name?: string | null; email: string } | null;
};

export class LeaseResidentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string | null;

  @ApiProperty()
  email!: string;
}

export class LeaseUnitTypeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class LeaseUnitDto {
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

  @ApiPropertyOptional({ type: LeaseUnitTypeDto, nullable: true })
  unitType?: LeaseUnitTypeDto | null;
}

export class LeaseResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  unitId!: string;

  @ApiProperty()
  occupancyId!: string | null;

  @ApiProperty({ enum: LeaseStatus })
  status!: LeaseStatus;

  @ApiProperty()
  leaseStartDate!: Date;

  @ApiProperty()
  leaseEndDate!: Date;

  @ApiProperty({
    required: false,
    description: 'Tenancy registration expiry (Ejari/Tawtheeq)',
  })
  tenancyRegistrationExpiry?: Date | null;

  @ApiProperty({
    required: false,
    description: 'Date tenant gave notice to vacate',
  })
  noticeGivenDate?: Date | null;

  @ApiProperty()
  annualRent!: unknown;

  @ApiProperty({ enum: PaymentFrequency })
  paymentFrequency!: PaymentFrequency;

  @ApiProperty({ required: false })
  numberOfCheques?: number | null;

  @ApiProperty()
  securityDepositAmount!: unknown;

  @ApiProperty({ required: false })
  internetTvProvider?: string | null;

  @ApiProperty({ enum: ServiceChargesPaidBy, required: false })
  serviceChargesPaidBy?: ServiceChargesPaidBy | null;

  @ApiProperty({ required: false })
  vatApplicable?: boolean | null;

  @ApiProperty({ required: false })
  notes?: string | null;

  @ApiProperty({ enum: YesNo, required: false })
  firstPaymentReceived?: YesNo | null;

  @ApiProperty({ required: false })
  firstPaymentAmount?: unknown | null;

  @ApiProperty({ enum: YesNo, required: false })
  depositReceived?: YesNo | null;

  @ApiProperty({ required: false })
  depositReceivedAmount?: unknown | null;

  @ApiProperty({ required: false })
  actualMoveOutDate?: Date | null;

  @ApiProperty({ required: false })
  forwardingPhone?: string | null;

  @ApiProperty({ required: false })
  forwardingEmail?: string | null;

  @ApiProperty({ required: false })
  forwardingAddress?: string | null;

  @ApiProperty({ required: false })
  finalElectricityReading?: string | null;

  @ApiProperty({ required: false })
  finalWaterReading?: string | null;

  @ApiProperty({ required: false })
  finalGasReading?: string | null;

  @ApiProperty({ enum: ConditionStatus, required: false })
  wallsCondition?: ConditionStatus | null;

  @ApiProperty({ enum: ConditionStatus, required: false })
  floorCondition?: ConditionStatus | null;

  @ApiProperty({ enum: ConditionStatus, required: false })
  kitchenCondition?: ConditionStatus | null;

  @ApiProperty({ enum: ConditionStatus, required: false })
  bathroomCondition?: ConditionStatus | null;

  @ApiProperty({ enum: ConditionStatus, required: false })
  doorsLocksCondition?: ConditionStatus | null;

  @ApiProperty({ enum: YesNo, required: false })
  keysReturned?: YesNo | null;

  @ApiProperty({ required: false })
  accessCardsReturnedCount?: number | null;

  @ApiProperty({ enum: YesNo, required: false })
  parkingStickersReturned?: YesNo | null;

  @ApiProperty({ required: false })
  damageDescription?: string | null;

  @ApiProperty({ required: false })
  damageCharges?: unknown | null;

  @ApiProperty({ required: false })
  pendingRent?: unknown | null;

  @ApiProperty({ required: false })
  pendingUtilities?: unknown | null;

  @ApiProperty({ required: false })
  pendingServiceFines?: unknown | null;

  @ApiProperty({ required: false })
  totalDeductions?: unknown | null;

  @ApiProperty({ required: false })
  netRefund?: unknown | null;

  @ApiProperty({ required: false })
  inspectionDoneBy?: string | null;

  @ApiProperty({ required: false })
  inspectionDate?: Date | null;

  @ApiProperty({ enum: ApprovalStatus, required: false })
  managerApproval?: ApprovalStatus | null;

  @ApiProperty({ enum: RefundMethod, required: false })
  refundMethod?: RefundMethod | null;

  @ApiProperty({ required: false })
  refundDate?: Date | null;

  @ApiProperty({ required: false })
  adminNotes?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: LeaseResidentDto, nullable: true })
  resident?: LeaseResidentDto | null;

  @ApiPropertyOptional({ type: LeaseUnitDto, nullable: true })
  unit?: LeaseUnitDto | null;
}

export const toLeaseResponse = (
  lease: LeaseWithRelations,
): LeaseResponseDto => ({
  id: lease.id,
  orgId: lease.orgId,
  buildingId: lease.buildingId,
  unitId: lease.unitId,
  occupancyId: lease.occupancyId,
  status: lease.status,
  leaseStartDate: lease.leaseStartDate,
  leaseEndDate: lease.leaseEndDate,
  tenancyRegistrationExpiry: lease.tenancyRegistrationExpiry ?? null,
  noticeGivenDate: lease.noticeGivenDate ?? null,
  annualRent: lease.annualRent,
  paymentFrequency: lease.paymentFrequency,
  numberOfCheques: lease.numberOfCheques ?? null,
  securityDepositAmount: lease.securityDepositAmount,
  internetTvProvider: lease.internetTvProvider ?? null,
  serviceChargesPaidBy: lease.serviceChargesPaidBy ?? null,
  vatApplicable: lease.vatApplicable ?? null,
  notes: lease.notes ?? null,
  firstPaymentReceived: lease.firstPaymentReceived ?? null,
  firstPaymentAmount: lease.firstPaymentAmount ?? null,
  depositReceived: lease.depositReceived ?? null,
  depositReceivedAmount: lease.depositReceivedAmount ?? null,
  actualMoveOutDate: lease.actualMoveOutDate ?? null,
  forwardingPhone: lease.forwardingPhone ?? null,
  forwardingEmail: lease.forwardingEmail ?? null,
  forwardingAddress: lease.forwardingAddress ?? null,
  finalElectricityReading: lease.finalElectricityReading ?? null,
  finalWaterReading: lease.finalWaterReading ?? null,
  finalGasReading: lease.finalGasReading ?? null,
  wallsCondition: lease.wallsCondition ?? null,
  floorCondition: lease.floorCondition ?? null,
  kitchenCondition: lease.kitchenCondition ?? null,
  bathroomCondition: lease.bathroomCondition ?? null,
  doorsLocksCondition: lease.doorsLocksCondition ?? null,
  keysReturned: lease.keysReturned ?? null,
  accessCardsReturnedCount: lease.accessCardsReturnedCount ?? null,
  parkingStickersReturned: lease.parkingStickersReturned ?? null,
  damageDescription: lease.damageDescription ?? null,
  damageCharges: lease.damageCharges ?? null,
  pendingRent: lease.pendingRent ?? null,
  pendingUtilities: lease.pendingUtilities ?? null,
  pendingServiceFines: lease.pendingServiceFines ?? null,
  totalDeductions: lease.totalDeductions ?? null,
  netRefund: lease.netRefund ?? null,
  inspectionDoneBy: lease.inspectionDoneBy ?? null,
  inspectionDate: lease.inspectionDate ?? null,
  managerApproval: lease.managerApproval ?? null,
  refundMethod: lease.refundMethod ?? null,
  refundDate: lease.refundDate ?? null,
  adminNotes: lease.adminNotes ?? null,
  createdAt: lease.createdAt,
  updatedAt: lease.updatedAt,
  resident:
    (lease.residentUser ?? lease.occupancy?.residentUser)
      ? {
          id: (lease.residentUser ?? lease.occupancy?.residentUser)!.id,
          name:
            (lease.residentUser ?? lease.occupancy?.residentUser)!.name ?? null,
          email: (lease.residentUser ?? lease.occupancy?.residentUser)!.email,
        }
      : null,
  unit: lease.unit
    ? {
        id: lease.unit.id,
        label: lease.unit.label,
        floor: lease.unit.floor ?? null,
        bedrooms: lease.unit.bedrooms ?? null,
        bathrooms: lease.unit.bathrooms ?? null,
        unitSize: lease.unit.unitSize ?? null,
        unitSizeUnit: lease.unit.unitSizeUnit ?? null,
        furnishedStatus: lease.unit.furnishedStatus ?? null,
        unitType: lease.unit.unitType
          ? { id: lease.unit.unitType.id, name: lease.unit.unitType.name }
          : null,
      }
    : null,
});

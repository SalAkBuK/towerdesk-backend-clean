import { LeaseStatus, PaymentFrequency } from '@prisma/client';
import { toContractResponse } from './contract.dto';

describe('toContractResponse', () => {
  const makeContract = (
    overrides: Partial<Parameters<typeof toContractResponse>[0]> = {},
  ): Parameters<typeof toContractResponse>[0] =>
    ({
      id: 'contract-1',
      orgId: 'org-1',
      buildingId: 'building-1',
      unitId: 'unit-1',
      occupancyId: null,
      residentUserId: 'resident-1',
      status: LeaseStatus.ACTIVE,
      leaseStartDate: new Date('2026-01-01T00:00:00.000Z'),
      leaseEndDate: new Date('2026-12-31T00:00:00.000Z'),
      ijariId: null,
      contractDate: null,
      actualMoveOutDate: null,
      propertyUsage: null,
      annualRent: '48000.00',
      paymentFrequency: PaymentFrequency.QUARTERLY,
      numberOfCheques: 4,
      securityDepositAmount: '5000.00',
      contractValue: '48000.00',
      paymentModeText: '4 cheques',
      ownerNameSnapshot: null,
      landlordNameSnapshot: null,
      tenantNameSnapshot: null,
      tenantEmailSnapshot: null,
      landlordEmailSnapshot: null,
      tenantPhoneSnapshot: null,
      landlordPhoneSnapshot: null,
      buildingNameSnapshot: null,
      locationCommunity: null,
      propertySizeSqm: null,
      propertyTypeLabel: null,
      propertyNumber: null,
      premisesNoDewa: null,
      plotNo: null,
      tenancyRegistrationExpiry: null,
      noticeGivenDate: null,
      internetTvProvider: null,
      serviceChargesPaidBy: null,
      vatApplicable: null,
      notes: null,
      firstPaymentReceived: null,
      firstPaymentAmount: null,
      depositReceived: null,
      depositReceivedAmount: null,
      forwardingPhone: null,
      forwardingEmail: null,
      forwardingAddress: null,
      finalElectricityReading: null,
      finalWaterReading: null,
      finalGasReading: null,
      wallsCondition: null,
      floorCondition: null,
      kitchenCondition: null,
      bathroomCondition: null,
      doorsLocksCondition: null,
      keysReturned: null,
      accessCardsReturnedCount: null,
      parkingStickersReturned: null,
      damageDescription: null,
      damageCharges: null,
      pendingRent: null,
      pendingUtilities: null,
      pendingServiceFines: null,
      totalDeductions: null,
      netRefund: null,
      inspectionDoneBy: null,
      inspectionDate: null,
      managerApproval: null,
      refundMethod: null,
      refundDate: null,
      adminNotes: null,
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
      updatedAt: new Date('2025-12-02T00:00:00.000Z'),
      residentUser: null,
      occupancy: null,
      unit: null,
      additionalTerms: [],
      ...overrides,
    }) as Parameters<typeof toContractResponse>[0];

  it('preserves raw active status when no move-out exists', () => {
    const response = toContractResponse(makeContract());

    expect(response.status).toBe(LeaseStatus.ACTIVE);
    expect(response.displayStatus).toBe(LeaseStatus.ACTIVE);
    expect(response.actualMoveOutDate).toBeNull();
  });

  it('reports early terminated move-outs as MOVED_OUT for display', () => {
    const actualMoveOutDate = new Date('2026-07-15T00:00:00.000Z');

    const response = toContractResponse({
      ...makeContract(),
      status: LeaseStatus.CANCELLED,
      actualMoveOutDate,
    });

    expect(response.status).toBe(LeaseStatus.CANCELLED);
    expect(response.displayStatus).toBe('MOVED_OUT');
    expect(response.actualMoveOutDate).toBe(actualMoveOutDate);
  });

  it('keeps true cancellations as CANCELLED for display', () => {
    const response = toContractResponse({
      ...makeContract(),
      status: LeaseStatus.CANCELLED,
    });

    expect(response.status).toBe(LeaseStatus.CANCELLED);
    expect(response.displayStatus).toBe(LeaseStatus.CANCELLED);
    expect(response.actualMoveOutDate).toBeNull();
  });

  it('reports ended contracts as MOVED_OUT for display', () => {
    const response = toContractResponse({
      ...makeContract(),
      status: LeaseStatus.ENDED,
    });

    expect(response.status).toBe(LeaseStatus.ENDED);
    expect(response.displayStatus).toBe('MOVED_OUT');
  });
});

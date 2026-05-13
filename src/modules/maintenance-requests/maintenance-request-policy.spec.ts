import {
  getMaintenanceRequestPolicyRecommendation,
  getMaintenanceRequestPolicyRoute,
  getPrimaryMaintenanceRequestQueue,
} from './maintenance-request-policy';

describe('maintenance request policy routing', () => {
  it('routes clear emergency intake to emergency dispatch', () => {
    const input = {
      title: 'Water leak causing damage',
      description: 'Ceiling is flooding into the hallway',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
    };

    expect(getMaintenanceRequestPolicyRoute(input)).toBe('EMERGENCY_DISPATCH');
    expect(getMaintenanceRequestPolicyRecommendation(input)).toBe(
      'PROCEED_AND_NOTIFY',
    );
    expect(getPrimaryMaintenanceRequestQueue(input)).toBe('READY_TO_ASSIGN');
  });

  it('routes explicit emergency signals to emergency dispatch', () => {
    const input = {
      title: 'AC issue',
      description: 'Bedroom AC stopped working',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
      emergencySignals: ['NO_COOLING'],
    };

    expect(getMaintenanceRequestPolicyRoute(input)).toBe('EMERGENCY_DISPATCH');
    expect(getMaintenanceRequestPolicyRecommendation(input)).toBe(
      'PROCEED_AND_NOTIFY',
    );
    expect(getPrimaryMaintenanceRequestQueue(input)).toBe('READY_TO_ASSIGN');
  });

  it('routes clear minor intake directly to assignment', () => {
    const input = {
      title: 'Light bulb out',
      type: 'ELECTRICAL',
      priority: 'LOW',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
    };

    expect(getMaintenanceRequestPolicyRoute(input)).toBe('DIRECT_ASSIGN');
    expect(getMaintenanceRequestPolicyRecommendation(input)).toBe(
      'PROCEED_NOW',
    );
    expect(getPrimaryMaintenanceRequestQueue(input)).toBe('READY_TO_ASSIGN');
  });

  it('routes unclear intake to needs estimate until facts arrive', () => {
    const input = {
      title: 'Water heater issue',
      description: 'No hot water in the bathroom',
      type: 'PLUMBING_AC_HEATING',
      priority: 'HIGH',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
    };

    expect(getMaintenanceRequestPolicyRoute(input)).toBe('NEEDS_ESTIMATE');
    expect(getMaintenanceRequestPolicyRecommendation(input)).toBe(
      'GET_ESTIMATE',
    );
    expect(getPrimaryMaintenanceRequestQueue(input)).toBe('NEEDS_ESTIMATE');
  });

  it('keeps explicitly requested estimates in the needs-estimate queue', () => {
    const input = {
      title: 'AC not cooling',
      description: 'Provider estimate visit requested',
      status: 'OPEN',
      estimateStatus: 'REQUESTED',
      ownerApprovalStatus: 'NOT_REQUIRED',
    };

    expect(getMaintenanceRequestPolicyRoute(input)).toBe('NEEDS_ESTIMATE');
    expect(getMaintenanceRequestPolicyRecommendation(input)).toBe(
      'GET_ESTIMATE',
    );
    expect(getPrimaryMaintenanceRequestQueue(input)).toBe('AWAITING_ESTIMATE');
  });

  it('routes cost-sensitive triage to owner approval required', () => {
    const input = {
      title: 'Replace water heater',
      status: 'OPEN',
      ownerApprovalStatus: 'NOT_REQUIRED',
      estimatedAmount: 1800,
      isMajorReplacement: true,
    };

    expect(getMaintenanceRequestPolicyRoute(input)).toBe(
      'OWNER_APPROVAL_REQUIRED',
    );
    expect(getMaintenanceRequestPolicyRecommendation(input)).toBe(
      'REQUEST_OWNER_APPROVAL',
    );
  });
});

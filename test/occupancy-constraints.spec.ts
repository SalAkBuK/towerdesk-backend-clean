import { BadRequestException, ConflictException } from '@nestjs/common';
import { mapOccupancyConstraintError } from '../src/common/utils/occupancy-constraints';

describe('mapOccupancyConstraintError', () => {
  it('maps active unit constraint to conflict', () => {
    const error = {
      code: 'P2002',
      meta: { target: 'uniq_active_occupancy_per_unit' },
      message: 'Unique constraint failed',
    };

    const mapped = mapOccupancyConstraintError(error);
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(mapped?.message).toBe('Unit is already occupied');
  });

  it('maps active resident constraint to conflict', () => {
    const error = {
      code: 'P2002',
      meta: { target: 'uniq_active_occupancy_per_resident' },
      message: 'Unique constraint failed',
    };

    const mapped = mapOccupancyConstraintError(error);
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(mapped?.message).toBe('Resident already occupying a unit');
  });

  it('maps status/endAt constraint to bad request', () => {
    const error = {
      code: 'P2004',
      message:
        'ERROR: new row violates check constraint "occupancy_status_endat_consistency"',
    };

    const mapped = mapOccupancyConstraintError(error);
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(mapped?.message).toBe('Invalid occupancy state');
  });
});

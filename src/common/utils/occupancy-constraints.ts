import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type OccupancyConstraint = 'unit' | 'resident' | 'status';

const OCCUPANCY_CONSTRAINTS: Record<OccupancyConstraint, string> = {
  unit: 'uniq_active_occupancy_per_unit',
  resident: 'uniq_active_occupancy_per_resident',
  status: 'occupancy_status_endat_consistency',
};

const collectConstraintStrings = (error: unknown) => {
  const values: string[] = [];
  if (!error) {
    return values;
  }

  if (typeof error === 'string') {
    values.push(error);
    return values;
  }

  if (error instanceof Error) {
    values.push(error.message);
  }

  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string') {
      values.push(error.message);
    }
    if ('cause' in error && typeof error.cause === 'string') {
      values.push(error.cause);
    }
    const meta = (error as { meta?: unknown }).meta;
    if (meta && typeof meta === 'object') {
      for (const value of Object.values(meta as Record<string, unknown>)) {
        if (typeof value === 'string') {
          values.push(value);
        } else if (Array.isArray(value)) {
          for (const entry of value) {
            if (typeof entry === 'string') {
              values.push(entry);
            }
          }
        }
      }
    }
  }

  return values;
};

export const detectOccupancyConstraint = (
  error: unknown,
): OccupancyConstraint | null => {
  const hasKnownPrismaError =
    error instanceof Prisma.PrismaClientKnownRequestError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string');

  const haystack = collectConstraintStrings(error).join(' ');
  if (!haystack) {
    return null;
  }

  if (hasKnownPrismaError || haystack.includes('occupancy_')) {
    for (const [kind, name] of Object.entries(OCCUPANCY_CONSTRAINTS)) {
      if (haystack.includes(name)) {
        return kind as OccupancyConstraint;
      }
    }
  }

  return null;
};

export const mapOccupancyConstraintError = (
  error: unknown,
): BadRequestException | ConflictException | null => {
  const constraint = detectOccupancyConstraint(error);
  if (!constraint) {
    return null;
  }

  if (constraint === 'unit') {
    return new ConflictException('Unit is already occupied');
  }
  if (constraint === 'resident') {
    return new ConflictException('Resident already occupying a unit');
  }
  if (constraint === 'status') {
    return new BadRequestException('Invalid occupancy state');
  }

  return null;
};

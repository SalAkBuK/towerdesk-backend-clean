import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LeaseActivityAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { CreateParkingSlotDto } from './dto/create-parking-slot.dto';
import { ListParkingSlotsQueryDto } from './dto/list-parking-slots.query.dto';
import { UpdateParkingSlotDto } from './dto/update-parking-slot.dto';
import { AllocateParkingSlotsDto } from './dto/allocate-parking-slots.dto';
import { EndParkingAllocationDto } from './dto/end-parking-allocation.dto';
import { ListParkingAllocationsQueryDto } from './dto/list-parking-allocations.query.dto';
import { ParkingRepo } from './parking.repo';
import { UnitsRepo } from '../units/units.repo';
import { parseCsv } from '../../common/utils/csv';
import {
  ImportParkingSlotsQueryDto,
  ParkingSlotsImportMode,
} from './dto/import-parking-slots.query.dto';
import {
  ImportParkingSlotsErrorDto,
  ImportParkingSlotsResponseDto,
} from './dto/import-parking-slots.response.dto';
import { ParkingSlotType } from '@prisma/client';

@Injectable()
export class ParkingService {
  constructor(
    private readonly parkingRepo: ParkingRepo,
    private readonly buildingsRepo: BuildingsRepo,
    private readonly unitsRepo: UnitsRepo,
    private readonly prisma: PrismaService,
  ) {}

  async createSlot(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: CreateParkingSlotDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    try {
      return await this.parkingRepo.create(orgId, buildingId, dto);
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException(
          'Parking slot code already exists for this building',
        );
      }
      throw error;
    }
  }

  async listSlots(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    query: ListParkingSlotsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return this.parkingRepo.listByBuilding(orgId, buildingId, query.available);
  }

  async updateSlot(
    user: AuthenticatedUser | undefined,
    slotId: string,
    dto: UpdateParkingSlotDto,
  ) {
    const orgId = assertOrgScope(user);
    const slot = await this.parkingRepo.findByIdForOrg(orgId, slotId);
    if (!slot) {
      throw new NotFoundException('Parking slot not found');
    }

    try {
      return await this.parkingRepo.update(slot.id, dto);
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException(
          'Parking slot code already exists for this building',
        );
      }
      throw error;
    }
  }

  async importSlotsCsv(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    file: { buffer: Buffer; originalname?: string } | undefined,
    query: ImportParkingSlotsQueryDto,
  ): Promise<ImportParkingSlotsResponseDto> {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }

    const mode = query.mode ?? ParkingSlotsImportMode.CREATE;
    const dryRun = query.dryRun === true;

    const parsed = parseCsv(file.buffer.toString('utf-8'));
    const errors: ImportParkingSlotsErrorDto[] = [];
    const pushError = (
      row: number,
      field: string | undefined,
      message: string,
    ) => errors.push({ row, ...(field ? { field } : {}), message });

    if (parsed.headers.length === 0) {
      return {
        dryRun,
        mode,
        summary: { totalRows: 0, validRows: 0, created: 0, updated: 0 },
        errors: [{ row: 1, message: 'CSV is empty' }],
      };
    }

    const canonicalHeader = (value: string) =>
      value.toLowerCase().replace(/[\s_-]/g, '');

    const allowedHeaders = new Map<string, string>([
      ['code', 'code'],
      ['type', 'type'],
      ['level', 'level'],
      ['iscovered', 'isCovered'],
      ['isactive', 'isActive'],
    ]);

    const headerCanonicalToActual = new Map<string, string>();
    parsed.headers.forEach((header, index) => {
      const canonical = canonicalHeader(header);
      const expected = allowedHeaders.get(canonical);
      if (!expected) {
        pushError(1, header || `col_${index + 1}`, `Unknown header: ${header}`);
        return;
      }
      if (headerCanonicalToActual.has(canonical)) {
        pushError(1, header, `Duplicate header: ${header}`);
        return;
      }
      headerCanonicalToActual.set(canonical, header);
    });

    if (!headerCanonicalToActual.has('code')) {
      pushError(1, 'code', 'Missing required header: code');
    }
    if (!headerCanonicalToActual.has('type')) {
      pushError(1, 'type', 'Missing required header: type');
    }

    if (errors.length > 0) {
      return {
        dryRun,
        mode,
        summary: {
          totalRows: parsed.rows.length,
          validRows: 0,
          created: 0,
          updated: 0,
        },
        errors,
      };
    }

    const readCell = (row: Record<string, string>, canonical: string) => {
      const actual = headerCanonicalToActual.get(canonical);
      if (!actual) return undefined;
      const value = row[actual];
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const parseBool = (value: string, rowNum: number, field: string) => {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
      pushError(rowNum, field, `Invalid boolean: ${value}`);
      return undefined;
    };

    const normalizeEnum = (value: string) =>
      value.trim().toUpperCase().replace(/[\s-]/g, '_');

    const parseEnumField = <T extends string>(
      value: string,
      rowNum: number,
      field: string,
      allowed: ReadonlySet<T>,
    ): T | undefined => {
      const normalized = normalizeEnum(value) as T;
      if (allowed.has(normalized)) return normalized;
      pushError(rowNum, field, `Invalid ${field}: ${value}`);
      return undefined;
    };

    const maxRows = 5000;
    if (parsed.rows.length > maxRows) {
      return {
        dryRun,
        mode,
        summary: {
          totalRows: parsed.rows.length,
          validRows: 0,
          created: 0,
          updated: 0,
        },
        errors: [{ row: 1, message: `Too many rows (max ${maxRows})` }],
      };
    }

    type ParsedSlotRow = { row: number; data: CreateParkingSlotDto };
    const parsedSlots: ParsedSlotRow[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < parsed.rows.length; i++) {
      const csvRowNumber = i + 2;
      const row = parsed.rows[i];
      const anyValue = Object.values(row).some((v) => v.trim().length > 0);
      if (!anyValue) {
        continue;
      }

      const code = readCell(row, 'code');
      const type = readCell(row, 'type');
      if (!code) {
        pushError(csvRowNumber, 'code', 'Code is required');
        continue;
      }
      if (!type) {
        pushError(csvRowNumber, 'type', 'Type is required');
        continue;
      }
      if (seenCodes.has(code)) {
        pushError(csvRowNumber, 'code', `Duplicate code in CSV: ${code}`);
        continue;
      }
      seenCodes.add(code);

      const errorsBefore = errors.length;

      const dto: CreateParkingSlotDto = {
        code,
        type: parseEnumField<ParkingSlotType>(
          type,
          csvRowNumber,
          'type',
          new Set(Object.values(ParkingSlotType)),
        )!,
      };

      const level = readCell(row, 'level');
      if (level !== undefined) dto.level = level;

      const isCovered = readCell(row, 'iscovered');
      if (isCovered !== undefined)
        dto.isCovered = parseBool(isCovered, csvRowNumber, 'isCovered');

      const isActive = readCell(row, 'isactive');
      if (isActive !== undefined)
        dto.isActive = parseBool(isActive, csvRowNumber, 'isActive');

      if (errors.length === errorsBefore) {
        parsedSlots.push({ row: csvRowNumber, data: dto });
      }
    }

    const existing = await this.prisma.parkingSlot.findMany({
      where: { orgId, buildingId },
      select: { id: true, code: true },
    });
    const existingByCode = new Map(existing.map((s) => [s.code, s.id]));

    if (mode === ParkingSlotsImportMode.CREATE) {
      for (const entry of parsedSlots) {
        if (existingByCode.has(entry.data.code)) {
          pushError(
            entry.row,
            'code',
            `Parking slot code already exists: ${entry.data.code}`,
          );
        }
      }
    }

    if (dryRun || errors.length > 0) {
      return {
        dryRun,
        mode,
        summary: {
          totalRows: parsed.rows.length,
          validRows: parsedSlots.length,
          created: 0,
          updated: 0,
        },
        errors,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const slotIds: string[] = [];
      let created = 0;
      let updated = 0;

      for (const entry of parsedSlots) {
        const dto = entry.data;
        if (mode === ParkingSlotsImportMode.UPSERT) {
          const existingId = existingByCode.get(dto.code);
          if (existingId) {
            const updateData: Prisma.ParkingSlotUpdateInput = {
              level: dto.level ?? undefined,
              type: dto.type,
              isCovered: dto.isCovered ?? undefined,
              isActive: dto.isActive ?? undefined,
              code: dto.code,
            };
            await tx.parkingSlot.update({
              where: { id: existingId },
              data: updateData,
            });
            slotIds.push(existingId);
            updated++;
            continue;
          }
        }

        const slot = await tx.parkingSlot.create({
          data: {
            orgId,
            buildingId,
            code: dto.code,
            level: dto.level ?? null,
            type: dto.type,
            isCovered: dto.isCovered ?? false,
            isActive: dto.isActive ?? true,
          },
        });
        slotIds.push(slot.id);
        created++;
      }

      return { slotIds, created, updated };
    });

    return {
      dryRun,
      mode,
      summary: {
        totalRows: parsed.rows.length,
        validRows: parsedSlots.length,
        created: result.created,
        updated: result.updated,
      },
      errors: [],
      slotIds: result.slotIds,
    };
  }

  private async assertOccupancyInOrg(orgId: string, occupancyId: string) {
    return this.prisma.occupancy.findFirst({
      where: {
        id: occupancyId,
        building: { orgId },
      },
    });
  }

  private async assertActiveLeaseContextForOccupancy(
    orgId: string,
    occupancyId: string,
    tx?: DbClient,
  ) {
    const client = tx ?? this.prisma;
    const occupancy = await client.occupancy.findFirst({
      where: {
        id: occupancyId,
        building: { orgId },
      },
      select: {
        id: true,
        buildingId: true,
        status: true,
      },
    });
    if (!occupancy) {
      throw new NotFoundException('Occupancy not found');
    }
    if (occupancy.status !== 'ACTIVE') {
      throw new BadRequestException('Occupancy is not active');
    }

    const lease = await client.lease.findFirst({
      where: {
        orgId,
        occupancyId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });
    if (!lease) {
      throw new BadRequestException('Active lease not found for occupancy');
    }

    return { occupancy, lease };
  }

  private async createLeaseActivity(
    data: {
      orgId: string;
      leaseId: string;
      action: LeaseActivityAction;
      changedByUserId: string | null;
      payload: Prisma.InputJsonValue;
    },
    tx?: DbClient,
  ) {
    const client = tx ?? this.prisma;
    await client.leaseActivity.create({
      data: {
        orgId: data.orgId,
        leaseId: data.leaseId,
        action: data.action,
        changedByUserId: data.changedByUserId,
        payload: data.payload,
      },
    });
  }

  private async assertUnitInOrg(orgId: string, unitId: string) {
    return this.prisma.unit.findFirst({
      where: {
        id: unitId,
        building: { orgId },
      },
    });
  }

  async allocate(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: AllocateParkingSlotsDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const hasOccupancyId = typeof dto.occupancyId === 'string';
    const hasUnitId = typeof dto.unitId === 'string';
    if ((hasOccupancyId && hasUnitId) || (!hasOccupancyId && !hasUnitId)) {
      throw new BadRequestException(
        'Provide either occupancyId or unitId, but not both',
      );
    }

    const allocationTarget: { occupancyId: string } | { unitId: string } =
      hasOccupancyId
        ? { occupancyId: dto.occupancyId! }
        : { unitId: dto.unitId! };

    let leaseIdForOccupancyAllocation: string | null = null;
    if ('occupancyId' in allocationTarget) {
      const context = await this.assertActiveLeaseContextForOccupancy(
        orgId,
        allocationTarget.occupancyId,
      );
      if (context.occupancy.buildingId !== buildingId) {
        throw new NotFoundException('Occupancy not found');
      }
      leaseIdForOccupancyAllocation = context.lease.id;
    } else {
      const unit = await this.unitsRepo.findByIdForBuilding(
        buildingId,
        allocationTarget.unitId,
      );
      if (!unit) {
        throw new NotFoundException('Unit not found');
      }
    }

    const hasSlotIds = Array.isArray(dto.slotIds);
    const hasCount = typeof dto.count === 'number';
    if ((hasSlotIds && hasCount) || (!hasSlotIds && !hasCount)) {
      throw new BadRequestException(
        'Provide either slotIds or count, but not both',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let leaseIdForActivity = leaseIdForOccupancyAllocation;
      if ('occupancyId' in allocationTarget) {
        const context = await this.assertActiveLeaseContextForOccupancy(
          orgId,
          allocationTarget.occupancyId,
          tx,
        );
        leaseIdForActivity = context.lease.id;
      }

      const slotIds: string[] = [];

      if (hasSlotIds && dto.slotIds) {
        const slots = await this.parkingRepo.findManyByIds(
          orgId,
          buildingId,
          dto.slotIds,
          tx,
        );
        if (slots.length !== dto.slotIds.length) {
          throw new NotFoundException('One or more parking slots not found');
        }
        const activeAllocations =
          await this.parkingRepo.findActiveAllocationsForSlots(dto.slotIds, tx);
        if (activeAllocations.length > 0) {
          throw new ConflictException(
            'One or more slots are already allocated',
          );
        }
        slotIds.push(...dto.slotIds);
      }

      if (hasCount && dto.count) {
        const available = await this.parkingRepo.findAvailableSlots(
          orgId,
          buildingId,
          dto.count,
          tx,
        );
        if (available.length < dto.count) {
          throw new ConflictException('Not enough available parking slots');
        }
        slotIds.push(...available.map((s) => s.id));
      }

      const allocations = await this.parkingRepo.createAllocations(
        orgId,
        buildingId,
        allocationTarget,
        slotIds,
        tx,
      );

      if ('occupancyId' in allocationTarget && leaseIdForActivity) {
        await this.createLeaseActivity(
          {
            orgId,
            leaseId: leaseIdForActivity,
            action: LeaseActivityAction.PARKING_ALLOCATED,
            changedByUserId: user?.sub ?? null,
            payload: {
              occupancyId: allocationTarget.occupancyId,
              allocationIds: allocations.map((item) => item.id),
              slotIds: allocations.map((item) => item.parkingSlotId),
              slotCodes: allocations.map((item) => item.parkingSlot.code),
              count: allocations.length,
            },
          },
          tx,
        );
      }

      // fetch with slot relation ensured in createAllocations
      return allocations;
    });
  }

  async endAllocation(
    user: AuthenticatedUser | undefined,
    allocationId: string,
    dto: EndParkingAllocationDto,
  ) {
    const orgId = assertOrgScope(user);
    const allocation = await this.parkingRepo.findAllocationByIdForOrg(
      orgId,
      allocationId,
    );
    if (!allocation) {
      throw new NotFoundException('Allocation not found');
    }
    if (allocation.endDate) {
      throw new BadRequestException('Allocation already ended');
    }
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    return this.prisma.$transaction(async (tx) => {
      let leaseIdForActivity: string | null = null;
      if (allocation.occupancyId) {
        const context = await this.assertActiveLeaseContextForOccupancy(
          orgId,
          allocation.occupancyId,
          tx,
        );
        leaseIdForActivity = context.lease.id;
      }

      await this.parkingRepo.endAllocation(allocation.id, endDate, tx);
      const updated = await this.parkingRepo.findAllocationByIdForOrg(
        orgId,
        allocationId,
        tx,
      );
      if (!updated) {
        throw new NotFoundException('Allocation not found after update');
      }

      if (leaseIdForActivity) {
        await this.createLeaseActivity(
          {
            orgId,
            leaseId: leaseIdForActivity,
            action: LeaseActivityAction.PARKING_ALLOCATION_ENDED,
            changedByUserId: user?.sub ?? null,
            payload: {
              occupancyId: updated.occupancyId,
              allocationId: updated.id,
              parkingSlotId: updated.parkingSlotId,
              parkingSlotCode: updated.parkingSlot.code,
              endDate: endDate.toISOString(),
            },
          },
          tx,
        );
      }

      return updated;
    });
  }

  async endAllForOccupancy(
    user: AuthenticatedUser | undefined,
    occupancyId: string,
    dto: EndParkingAllocationDto,
  ) {
    const orgId = assertOrgScope(user);
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    return this.prisma.$transaction(async (tx) => {
      const context = await this.assertActiveLeaseContextForOccupancy(
        orgId,
        occupancyId,
        tx,
      );
      const result = await this.parkingRepo.endAllActiveForOccupancy(
        orgId,
        occupancyId,
        endDate,
        tx,
      );
      if (result.count > 0) {
        await this.createLeaseActivity(
          {
            orgId,
            leaseId: context.lease.id,
            action: LeaseActivityAction.PARKING_ALLOCATION_ENDED,
            changedByUserId: user?.sub ?? null,
            payload: {
              occupancyId,
              endedCount: result.count,
              endDate: endDate.toISOString(),
              scope: 'ALL_ACTIVE_ALLOCATIONS',
            },
          },
          tx,
        );
      }
      return { ended: result.count };
    });
  }

  async endAllForUnit(
    user: AuthenticatedUser | undefined,
    unitId: string,
    dto: EndParkingAllocationDto,
  ) {
    const orgId = assertOrgScope(user);
    const unit = await this.assertUnitInOrg(orgId, unitId);
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    const result = await this.parkingRepo.endAllActiveForUnit(
      orgId,
      unitId,
      endDate,
    );
    return { ended: result.count };
  }

  async listAllocations(
    user: AuthenticatedUser | undefined,
    occupancyId: string,
    query: ListParkingAllocationsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const occupancy = await this.assertOccupancyInOrg(orgId, occupancyId);
    if (!occupancy) {
      throw new NotFoundException('Occupancy not found');
    }
    const allocations = await this.parkingRepo.listAllocationsForOccupancy(
      orgId,
      occupancyId,
      query.active,
    );
    return allocations;
  }

  async listAllocationsForUnit(
    user: AuthenticatedUser | undefined,
    unitId: string,
    query: ListParkingAllocationsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const unit = await this.assertUnitInOrg(orgId, unitId);
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return this.parkingRepo.listAllocationsForUnit(orgId, unitId, query.active);
  }

  async getActiveAllocationForResident(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const occupancy = await this.prisma.occupancy.findFirst({
      where: {
        residentUserId: userId,
        status: 'ACTIVE',
        building: { orgId },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!occupancy) {
      return null;
    }

    const allocations = await this.parkingRepo.listAllocationsForOccupancy(
      orgId,
      occupancy.id,
      true,
    );

    return allocations[0] ?? null;
  }

  // Vehicle methods
  async createVehicle(
    user: AuthenticatedUser | undefined,
    occupancyId: string,
    dto: { plateNumber: string; label?: string },
  ) {
    const orgId = assertOrgScope(user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const context = await this.assertActiveLeaseContextForOccupancy(
          orgId,
          occupancyId,
          tx,
        );
        const created = await this.parkingRepo.createVehicle(
          orgId,
          occupancyId,
          dto,
          tx,
        );
        await this.createLeaseActivity(
          {
            orgId,
            leaseId: context.lease.id,
            action: LeaseActivityAction.VEHICLE_ADDED,
            changedByUserId: user?.sub ?? null,
            payload: {
              occupancyId,
              vehicleId: created.id,
              plateNumber: created.plateNumber,
              label: created.label,
            },
          },
          tx,
        );
        return created;
      });
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException(
          'Vehicle with this plate number already exists',
        );
      }
      throw error;
    }
  }

  async listVehicles(user: AuthenticatedUser | undefined, occupancyId: string) {
    const orgId = assertOrgScope(user);
    const occupancy = await this.assertOccupancyInOrg(orgId, occupancyId);
    if (!occupancy) {
      throw new NotFoundException('Occupancy not found');
    }
    return this.parkingRepo.listVehiclesForOccupancy(orgId, occupancyId);
  }

  async updateVehicle(
    user: AuthenticatedUser | undefined,
    vehicleId: string,
    dto: { plateNumber?: string; label?: string | null },
  ) {
    const orgId = assertOrgScope(user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await this.parkingRepo.findVehicleByIdForOrg(
          orgId,
          vehicleId,
          tx,
        );
        if (!vehicle) {
          throw new NotFoundException('Vehicle not found');
        }

        const context = await this.assertActiveLeaseContextForOccupancy(
          orgId,
          vehicle.occupancyId,
          tx,
        );
        const updated = await this.parkingRepo.updateVehicle(
          vehicleId,
          dto,
          tx,
        );
        await this.createLeaseActivity(
          {
            orgId,
            leaseId: context.lease.id,
            action: LeaseActivityAction.VEHICLE_UPDATED,
            changedByUserId: user?.sub ?? null,
            payload: {
              occupancyId: vehicle.occupancyId,
              vehicleId: updated.id,
              previous: {
                plateNumber: vehicle.plateNumber,
                label: vehicle.label,
              },
              current: {
                plateNumber: updated.plateNumber,
                label: updated.label,
              },
            },
          },
          tx,
        );
        return updated;
      });
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException(
          'Vehicle with this plate number already exists',
        );
      }
      throw error;
    }
  }

  async deleteVehicle(user: AuthenticatedUser | undefined, vehicleId: string) {
    const orgId = assertOrgScope(user);
    await this.prisma.$transaction(async (tx) => {
      const vehicle = await this.parkingRepo.findVehicleByIdForOrg(
        orgId,
        vehicleId,
        tx,
      );
      if (!vehicle) {
        throw new NotFoundException('Vehicle not found');
      }
      const context = await this.assertActiveLeaseContextForOccupancy(
        orgId,
        vehicle.occupancyId,
        tx,
      );
      await this.parkingRepo.deleteVehicle(vehicleId, tx);
      await this.createLeaseActivity(
        {
          orgId,
          leaseId: context.lease.id,
          action: LeaseActivityAction.VEHICLE_DELETED,
          changedByUserId: user?.sub ?? null,
          payload: {
            occupancyId: vehicle.occupancyId,
            vehicleId: vehicle.id,
            plateNumber: vehicle.plateNumber,
            label: vehicle.label,
          },
        },
        tx,
      );
    });
  }
}

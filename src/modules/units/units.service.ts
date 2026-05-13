import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FurnishedStatus,
  KitchenType,
  MaintenancePayer,
  PaymentFrequency,
  Prisma,
  UnitSizeUnit,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { BuildingsRepo } from '../buildings/buildings.repo';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UnitOwnershipService } from '../unit-ownerships/unit-ownership.service';
import { UnitsRepo } from './units.repo';
import { parseCsv } from '../../common/utils/csv';
import {
  ImportUnitsQueryDto,
  UnitsImportMode,
} from './dto/import-units.query.dto';
import {
  ImportUnitsErrorDto,
  ImportUnitsResponseDto,
} from './dto/import-units.response.dto';
import {
  UNITS_IMPORT_ALLOWED_HEADERS,
  UNITS_IMPORT_ENUM_SETS,
} from './units-import.constants';

@Injectable()
export class UnitsService {
  constructor(
    private readonly unitsRepo: UnitsRepo,
    private readonly buildingsRepo: BuildingsRepo,
    private readonly prisma: PrismaService,
    private readonly unitOwnershipService: UnitOwnershipService,
  ) {}

  async importCsv(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    file: { buffer: Buffer; originalname?: string } | undefined,
    query: ImportUnitsQueryDto,
  ): Promise<ImportUnitsResponseDto> {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }

    const mode = query.mode ?? UnitsImportMode.CREATE;
    const dryRun = query.dryRun === true;

    const csvText = file.buffer.toString('utf-8');
    const parsed = parseCsv(csvText);

    const canonicalHeader = (value: string) =>
      value.toLowerCase().replace(/[\s_-]/g, '');

    const errors: ImportUnitsErrorDto[] = [];

    if (parsed.headers.length === 0) {
      return {
        dryRun,
        mode,
        summary: { totalRows: 0, validRows: 0, created: 0, updated: 0 },
        errors: [{ row: 1, message: 'CSV is empty' }],
      };
    }

    const headerCanonicalToActual = new Map<string, string>();
    parsed.headers.forEach((header, index) => {
      const canonical = canonicalHeader(header);
      const expected = UNITS_IMPORT_ALLOWED_HEADERS.get(canonical);
      if (!expected) {
        errors.push({
          row: 1,
          field: header || `col_${index + 1}`,
          message: `Unknown header: ${header}`,
        });
        return;
      }
      if (headerCanonicalToActual.has(canonical)) {
        errors.push({
          row: 1,
          field: header,
          message: `Duplicate header: ${header}`,
        });
        return;
      }
      headerCanonicalToActual.set(canonical, header);
    });

    if (!headerCanonicalToActual.has('label')) {
      errors.push({
        row: 1,
        field: 'label',
        message: 'Missing required header: label',
      });
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

    const pushError = (
      row: number,
      field: string | undefined,
      message: string,
    ) => errors.push({ row, ...(field ? { field } : {}), message });

    const parseBool = (value: string, rowNum: number, field: string) => {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
      pushError(rowNum, field, `Invalid boolean: ${value}`);
      return undefined;
    };

    const parseIntField = (value: string, rowNum: number, field: string) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) {
        pushError(rowNum, field, `Invalid integer: ${value}`);
        return undefined;
      }
      return parsed;
    };

    const parseNumberField = (value: string, rowNum: number, field: string) => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) {
        pushError(rowNum, field, `Invalid number: ${value}`);
        return undefined;
      }
      return parsed;
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

    const unitTypes = await this.prisma.unitType.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true },
    });
    const unitTypeByName = new Map(
      unitTypes.map((t) => [t.name.trim().toLowerCase(), t.id]),
    );

    const maxRows = 2000;
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
        errors: [
          {
            row: 1,
            message: `Too many rows (max ${maxRows})`,
          },
        ],
      };
    }

    type ParsedUnitRow = { row: number; dto: CreateUnitDto };
    const seenLabels = new Set<string>();
    const parsedUnits: ParsedUnitRow[] = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      const csvRowNumber = i + 2;
      const row = parsed.rows[i];
      const label = readCell(row, 'label');
      const anyValue = Object.values(row).some((v) => v.trim().length > 0);
      if (!anyValue) {
        continue;
      }
      if (!label) {
        pushError(csvRowNumber, 'label', 'Label is required');
        continue;
      }
      if (seenLabels.has(label)) {
        pushError(csvRowNumber, 'label', `Duplicate label in CSV: ${label}`);
        continue;
      }
      seenLabels.add(label);

      const dto: CreateUnitDto = { label };
      const errorsBefore = errors.length;

      const floor = readCell(row, 'floor');
      if (floor) dto.floor = parseIntField(floor, csvRowNumber, 'floor');

      const notes = readCell(row, 'notes');
      if (notes) dto.notes = notes;

      const bedrooms = readCell(row, 'bedrooms');
      if (bedrooms)
        dto.bedrooms = parseIntField(bedrooms, csvRowNumber, 'bedrooms');

      const bathrooms = readCell(row, 'bathrooms');
      if (bathrooms)
        dto.bathrooms = parseIntField(bathrooms, csvRowNumber, 'bathrooms');

      const unitSize = readCell(row, 'unitsize');
      if (unitSize)
        dto.unitSize = parseNumberField(unitSize, csvRowNumber, 'unitSize');

      const unitSizeUnit = readCell(row, 'unitsizeunit');
      if (unitSizeUnit) {
        dto.unitSizeUnit = parseEnumField<UnitSizeUnit>(
          unitSizeUnit,
          csvRowNumber,
          'unitSizeUnit',
          UNITS_IMPORT_ENUM_SETS.unitSizeUnit,
        );
      }

      const furnishedStatus = readCell(row, 'furnishedstatus');
      if (furnishedStatus) {
        dto.furnishedStatus = parseEnumField<FurnishedStatus>(
          furnishedStatus,
          csvRowNumber,
          'furnishedStatus',
          UNITS_IMPORT_ENUM_SETS.furnishedStatus,
        );
      }

      const balcony = readCell(row, 'balcony');
      if (balcony) dto.balcony = parseBool(balcony, csvRowNumber, 'balcony');

      const kitchenType = readCell(row, 'kitchentype');
      if (kitchenType) {
        dto.kitchenType = parseEnumField<KitchenType>(
          kitchenType,
          csvRowNumber,
          'kitchenType',
          UNITS_IMPORT_ENUM_SETS.kitchenType,
        );
      }

      const rentAnnual = readCell(row, 'rentannual');
      if (rentAnnual)
        dto.rentAnnual = parseNumberField(
          rentAnnual,
          csvRowNumber,
          'rentAnnual',
        );

      const paymentFrequency = readCell(row, 'paymentfrequency');
      if (paymentFrequency) {
        dto.paymentFrequency = parseEnumField<PaymentFrequency>(
          paymentFrequency,
          csvRowNumber,
          'paymentFrequency',
          UNITS_IMPORT_ENUM_SETS.paymentFrequency,
        );
      }

      const securityDepositAmount = readCell(row, 'securitydepositamount');
      if (securityDepositAmount) {
        dto.securityDepositAmount = parseNumberField(
          securityDepositAmount,
          csvRowNumber,
          'securityDepositAmount',
        );
      }

      const serviceChargePerUnit = readCell(row, 'servicechargeperunit');
      if (serviceChargePerUnit) {
        dto.serviceChargePerUnit = parseNumberField(
          serviceChargePerUnit,
          csvRowNumber,
          'serviceChargePerUnit',
        );
      }

      const vatApplicable = readCell(row, 'vatapplicable');
      if (vatApplicable)
        dto.vatApplicable = parseBool(
          vatApplicable,
          csvRowNumber,
          'vatApplicable',
        );

      const maintenancePayer = readCell(row, 'maintenancepayer');
      if (maintenancePayer) {
        dto.maintenancePayer = parseEnumField<MaintenancePayer>(
          maintenancePayer,
          csvRowNumber,
          'maintenancePayer',
          UNITS_IMPORT_ENUM_SETS.maintenancePayer,
        );
      }

      const electricityMeterNumber = readCell(row, 'electricitymeternumber');
      if (electricityMeterNumber)
        dto.electricityMeterNumber = electricityMeterNumber;

      const waterMeterNumber = readCell(row, 'watermeternumber');
      if (waterMeterNumber) dto.waterMeterNumber = waterMeterNumber;

      const gasMeterNumber = readCell(row, 'gasmeternumber');
      if (gasMeterNumber) dto.gasMeterNumber = gasMeterNumber;

      const unitType = readCell(row, 'unittype');
      if (unitType) {
        const id = unitTypeByName.get(unitType.trim().toLowerCase());
        if (!id) {
          pushError(
            csvRowNumber,
            'unitType',
            `Unit type not found: ${unitType}`,
          );
        } else {
          dto.unitTypeId = id;
        }
      }

      if (errors.length === errorsBefore) {
        parsedUnits.push({ row: csvRowNumber, dto });
      }
    }

    const existingUnits = await this.prisma.unit.findMany({
      where: { buildingId },
      select: { id: true, label: true },
    });
    const existingByLabel = new Map(existingUnits.map((u) => [u.label, u.id]));

    if (mode === UnitsImportMode.CREATE) {
      for (const entry of parsedUnits) {
        if (existingByLabel.has(entry.dto.label)) {
          pushError(
            entry.row,
            'label',
            `Unit label already exists: ${entry.dto.label}`,
          );
        }
      }
    }

    const validRows = parsedUnits.length;
    if (dryRun || errors.length > 0) {
      return {
        dryRun,
        mode,
        summary: {
          totalRows: parsed.rows.length,
          validRows,
          created: 0,
          updated: 0,
        },
        errors,
      };
    }

    const amenityIds = await this.getDefaultAmenityIds(buildingId);
    await this.assertAmenityIds(buildingId, amenityIds);

    const result = await this.prisma.$transaction(async (tx) => {
      const unitIds: string[] = [];
      let created = 0;
      let updated = 0;

      for (const entry of parsedUnits) {
        const dto = entry.dto;
        if (mode === UnitsImportMode.UPSERT) {
          const existingId = existingByLabel.get(dto.label);
          if (existingId) {
            const updateData = this.mapUnitUpdate({
              ...dto,
              amenityIds: undefined,
            } as unknown as UpdateUnitDto);
            await tx.unit.update({
              where: { id: existingId },
              data: updateData,
            });
            unitIds.push(existingId);
            updated++;
            continue;
          }
        }

        const unit = await tx.unit.create({
          data: {
            buildingId,
            ...this.mapUnitData(dto),
          },
        });
        unitIds.push(unit.id);
        created++;

        if (amenityIds.length > 0) {
          await tx.unitAmenity.createMany({
            data: amenityIds.map((amenityId) => ({
              unitId: unit.id,
              amenityId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return { unitIds, created, updated };
    });

    return {
      dryRun,
      mode,
      summary: {
        totalRows: parsed.rows.length,
        validRows: parsedUnits.length,
        created: result.created,
        updated: result.updated,
      },
      errors: [],
      unitIds: result.unitIds,
    };
  }

  async create(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    dto: CreateUnitDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    try {
      await this.assertUnitTypeInOrg(orgId, dto.unitTypeId);
      await this.assertOwnerInOrg(orgId, dto.ownerId);
      const amenityIds =
        dto.amenityIds === undefined
          ? await this.getDefaultAmenityIds(buildingId)
          : dto.amenityIds;
      await this.assertAmenityIds(buildingId, amenityIds);

      const createdUnit = await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: {
            buildingId,
            ...this.mapUnitData(dto),
          },
        });

        if (amenityIds.length > 0) {
          await tx.unitAmenity.createMany({
            data: amenityIds.map((amenityId) => ({
              unitId: unit.id,
              amenityId,
            })),
            skipDuplicates: true,
          });
        }

        await this.unitOwnershipService.syncCurrentOwner({
          orgId,
          unitId: unit.id,
          ownerId: dto.ownerId ?? null,
          tx,
        });

        return unit;
      });

      return createdUnit;
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException('Unit label already exists');
      }
      throw error;
    }
  }

  async list(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    available?: boolean,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return this.unitsRepo.listByBuildingWithAvailability(
      buildingId,
      available === true,
    );
  }

  async listWithOccupancy(
    user: AuthenticatedUser | undefined,
    buildingId: string,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }
    return this.unitsRepo.listByBuildingWithOccupancy(buildingId);
  }

  async findById(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    unitId: string,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const unit = await this.unitsRepo.findByIdForBuildingWithAmenities(
      buildingId,
      unitId,
    );
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return unit;
  }

  async update(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    unitId: string,
    dto: UpdateUnitDto,
  ) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const unit = await this.unitsRepo.findByIdForBuilding(buildingId, unitId);
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    try {
      await this.assertUnitTypeInOrg(orgId, dto.unitTypeId);
      await this.assertOwnerInOrg(orgId, dto.ownerId);
      if (dto.amenityIds !== undefined) {
        await this.assertAmenityIds(buildingId, dto.amenityIds);
      }

      const data = this.mapUnitUpdate(dto);
      await this.prisma.$transaction(async (tx) => {
        const unitRecord =
          Object.keys(data).length > 0
            ? await tx.unit.update({
                where: { id: unit.id },
                data,
              })
            : await tx.unit.findUnique({ where: { id: unit.id } });

        if (!unitRecord) {
          throw new NotFoundException('Unit not found');
        }

        if (dto.amenityIds !== undefined) {
          await tx.unitAmenity.deleteMany({
            where: { unitId: unit.id },
          });
          if (dto.amenityIds.length > 0) {
            await tx.unitAmenity.createMany({
              data: dto.amenityIds.map((amenityId) => ({
                unitId: unit.id,
                amenityId,
              })),
              skipDuplicates: true,
            });
          }
        }

        if (dto.ownerId !== undefined) {
          await this.unitOwnershipService.syncCurrentOwner({
            orgId,
            unitId: unit.id,
            ownerId: dto.ownerId ?? null,
            tx,
          });
        }

        return unitRecord;
      });

      const updated = await this.unitsRepo.findByIdForBuildingWithAmenities(
        buildingId,
        unit.id,
      );
      if (!updated) {
        throw new NotFoundException('Unit not found');
      }
      return updated;
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException('Unit label already exists');
      }
      throw error;
    }
  }

  async countVacant(user: AuthenticatedUser | undefined, buildingId: string) {
    const orgId = assertOrgScope(user);
    const building = await this.buildingsRepo.findByIdForOrg(orgId, buildingId);
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const [total, vacant] = await Promise.all([
      this.unitsRepo.countByBuilding(buildingId),
      this.unitsRepo.countVacantByBuilding(buildingId),
    ]);

    return { total, vacant };
  }

  private async assertUnitTypeInOrg(orgId: string, unitTypeId?: string) {
    if (!unitTypeId) {
      return;
    }
    const unitType = await this.prisma.unitType.findFirst({
      where: { id: unitTypeId, orgId },
    });
    if (!unitType) {
      throw new NotFoundException('Unit type not found');
    }
  }

  private async assertOwnerInOrg(orgId: string, ownerId?: string) {
    if (!ownerId) {
      return;
    }
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, orgId },
    });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
  }

  private async getDefaultAmenityIds(buildingId: string) {
    const amenities = await this.prisma.buildingAmenity.findMany({
      where: { buildingId, isActive: true, isDefault: true },
      select: { id: true },
    });
    return amenities.map((amenity) => amenity.id);
  }

  private async assertAmenityIds(buildingId: string, amenityIds: string[]) {
    if (amenityIds.length === 0) {
      return;
    }
    const amenities = await this.prisma.buildingAmenity.findMany({
      where: {
        buildingId,
        isActive: true,
        id: { in: amenityIds },
      },
      select: { id: true },
    });
    if (amenities.length !== amenityIds.length) {
      throw new BadRequestException(
        'Amenity does not belong to the same building as the unit',
      );
    }
  }

  private mapUnitData(dto: CreateUnitDto) {
    return {
      label: dto.label,
      floor: dto.floor,
      notes: dto.notes,
      unitTypeId: dto.unitTypeId,
      ownerId: dto.ownerId,
      maintenancePayer: dto.maintenancePayer,
      unitSize:
        dto.unitSize !== undefined
          ? new Prisma.Decimal(dto.unitSize)
          : undefined,
      unitSizeUnit: dto.unitSizeUnit,
      bedrooms: dto.bedrooms,
      bathrooms: dto.bathrooms,
      balcony: dto.balcony,
      kitchenType: dto.kitchenType,
      furnishedStatus: dto.furnishedStatus,
      rentAnnual:
        dto.rentAnnual !== undefined
          ? new Prisma.Decimal(dto.rentAnnual)
          : undefined,
      paymentFrequency: dto.paymentFrequency,
      securityDepositAmount:
        dto.securityDepositAmount !== undefined
          ? new Prisma.Decimal(dto.securityDepositAmount)
          : undefined,
      serviceChargePerUnit:
        dto.serviceChargePerUnit !== undefined
          ? new Prisma.Decimal(dto.serviceChargePerUnit)
          : undefined,
      vatApplicable: dto.vatApplicable,
      electricityMeterNumber: dto.electricityMeterNumber,
      waterMeterNumber: dto.waterMeterNumber,
      gasMeterNumber: dto.gasMeterNumber,
    };
  }

  private mapUnitUpdate(dto: UpdateUnitDto): Prisma.UnitUpdateInput {
    const data: Prisma.UnitUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.unitTypeId !== undefined) {
      data.unitType = dto.unitTypeId
        ? { connect: { id: dto.unitTypeId } }
        : { disconnect: true };
    }
    if (dto.ownerId !== undefined) {
      data.owner = dto.ownerId
        ? { connect: { id: dto.ownerId } }
        : { disconnect: true };
    }
    if (dto.maintenancePayer !== undefined)
      data.maintenancePayer = dto.maintenancePayer;
    if (dto.unitSize !== undefined)
      data.unitSize = new Prisma.Decimal(dto.unitSize);
    if (dto.unitSizeUnit !== undefined) data.unitSizeUnit = dto.unitSizeUnit;
    if (dto.bedrooms !== undefined) data.bedrooms = dto.bedrooms;
    if (dto.bathrooms !== undefined) data.bathrooms = dto.bathrooms;
    if (dto.balcony !== undefined) data.balcony = dto.balcony;
    if (dto.kitchenType !== undefined) data.kitchenType = dto.kitchenType;
    if (dto.furnishedStatus !== undefined)
      data.furnishedStatus = dto.furnishedStatus;
    if (dto.rentAnnual !== undefined)
      data.rentAnnual = new Prisma.Decimal(dto.rentAnnual);
    if (dto.paymentFrequency !== undefined)
      data.paymentFrequency = dto.paymentFrequency;
    if (dto.securityDepositAmount !== undefined) {
      data.securityDepositAmount = new Prisma.Decimal(
        dto.securityDepositAmount,
      );
    }
    if (dto.serviceChargePerUnit !== undefined) {
      data.serviceChargePerUnit = new Prisma.Decimal(dto.serviceChargePerUnit);
    }
    if (dto.vatApplicable !== undefined) data.vatApplicable = dto.vatApplicable;
    if (dto.electricityMeterNumber !== undefined) {
      data.electricityMeterNumber = dto.electricityMeterNumber;
    }
    if (dto.waterMeterNumber !== undefined) {
      data.waterMeterNumber = dto.waterMeterNumber;
    }
    if (dto.gasMeterNumber !== undefined) {
      data.gasMeterNumber = dto.gasMeterNumber;
    }
    return data;
  }
}

import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import { UnitTypesRepo } from './unit-types.repo';

@Injectable()
export class UnitTypesService {
  constructor(private readonly unitTypesRepo: UnitTypesRepo) {}

  async listActive(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    return this.unitTypesRepo.listActive(orgId);
  }

  async create(user: AuthenticatedUser | undefined, dto: CreateUnitTypeDto) {
    const orgId = assertOrgScope(user);
    try {
      return await this.unitTypesRepo.create(orgId, dto);
    } catch (error: unknown) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;
      if (code === 'P2002') {
        throw new ConflictException('Unit type already exists');
      }
      throw error;
    }
  }
}

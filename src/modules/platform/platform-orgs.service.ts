import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateOrgAdminDto } from './dto/create-org-admin.dto';
import { CreateOrgDto } from './dto/create-org.dto';
import {
  describeEmailOwnershipConflict,
  normalizeEmail,
} from '../users/user-identity.util';
import {
  ROLE_TEMPLATE_PERMISSION_MAP,
  SYSTEM_ROLE_TEMPLATE_DEFINITIONS,
} from '../access-control/role-defaults';
import { buildUserAccessAssignmentId } from '../access-control/access-assignment-id.util';

@Injectable()
export class PlatformOrgsService {
  constructor(private readonly prisma: PrismaService) {}

  listOrgs() {
    return this.prisma.org.findMany({ orderBy: { createdAt: 'desc' } });
  }

  listOrgAdmins(orgId: string) {
    return this.prisma.user.findMany({
      where: {
        orgId,
        accessAssignments: {
          some: {
            scopeType: 'ORG',
            scopeId: null,
            roleTemplate: { key: 'org_admin', orgId },
          },
        },
      },
      include: {
        org: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAllOrgAdmins() {
    return this.prisma.user.findMany({
      where: {
        orgId: { not: null },
        accessAssignments: {
          some: {
            scopeType: 'ORG',
            scopeId: null,
            roleTemplate: { key: 'org_admin', orgId: { not: null } },
          },
        },
      },
      include: {
        org: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOrgById(orgId: string) {
    return this.prisma.org.findUnique({ where: { id: orgId } });
  }

  create(dto: CreateOrgDto) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.org.create({
        data: {
          name: dto.name,
          businessName: dto.businessName,
          businessType: dto.businessType,
          tradeLicenseNumber: dto.tradeLicenseNumber,
          vatRegistrationNumber: dto.vatRegistrationNumber,
          registeredOfficeAddress: dto.registeredOfficeAddress,
          city: dto.city,
          officePhoneNumber: dto.officePhoneNumber,
          businessEmailAddress: dto.businessEmailAddress,
          website: dto.website,
          ownerName: dto.ownerName,
        },
      });

      await this.provisionOrgRoles(tx, org.id);
      return org;
    });
  }

  async createOrgAdmin(orgId: string, dto: CreateOrgAdminDto) {
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Org not found');
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(
        describeEmailOwnershipConflict({
          existingOrgId: existing.orgId,
          targetOrgId: orgId,
        }),
      );
    }

    const tempPassword = dto.password ?? this.generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash,
        orgId,
        mustChangePassword: true,
      },
    });

    const role = await this.prisma.roleTemplate.findFirst({
      where: { key: 'org_admin', orgId },
    });
    if (!role) {
      throw new BadRequestException('ORG_ADMIN role not configured');
    }

    await this.prisma.userAccessAssignment.upsert({
      where: {
        id: buildUserAccessAssignmentId({
          userId: user.id,
          roleTemplateId: role.id,
          scopeType: 'ORG',
          scopeId: null,
        }),
      },
      update: {},
      create: {
        id: buildUserAccessAssignmentId({
          userId: user.id,
          roleTemplateId: role.id,
          scopeType: 'ORG',
          scopeId: null,
        }),
        userId: user.id,
        roleTemplateId: role.id,
        scopeType: 'ORG',
        scopeId: null,
      },
    });

    return {
      userId: user.id,
      email: user.email,
      tempPassword: dto.password ? undefined : tempPassword,
      mustChangePassword: true,
    };
  }

  private generateTempPassword() {
    return randomBytes(12).toString('base64url');
  }

  private async provisionOrgRoles(tx: Prisma.TransactionClient, orgId: string) {
    const roleRecords = await Promise.all(
      SYSTEM_ROLE_TEMPLATE_DEFINITIONS.map((role) =>
        tx.roleTemplate.upsert({
          where: { orgId_key: { orgId, key: role.key } },
          update: {
            name: role.name,
            description: role.description,
            isSystem: true,
            scopeType: role.scopeType,
          },
          create: {
            orgId,
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: true,
            scopeType: role.scopeType,
          },
        }),
      ),
    );

    const permissionKeys = Array.from(
      new Set(Object.values(ROLE_TEMPLATE_PERMISSION_MAP).flat()),
    );
    const permissions = await tx.permission.findMany({
      where: { key: { in: permissionKeys } },
    });
    const permissionByKey = new Map(
      permissions.map((permission) => [permission.key, permission.id]),
    );

    const roleByKey = new Map(roleRecords.map((role) => [role.key, role.id]));
    const data = Object.entries(ROLE_TEMPLATE_PERMISSION_MAP).flatMap(
      ([roleKey, keys]) => {
        const roleId = roleByKey.get(roleKey);
        if (!roleId) {
          return [];
        }
        return keys
          .map((key) => permissionByKey.get(key))
          .filter((permissionId): permissionId is string =>
            Boolean(permissionId),
          )
          .map((permissionId) => ({
            roleTemplateId: roleId,
            permissionId,
          }));
      },
    );

    if (data.length > 0) {
      await tx.roleTemplatePermission.createMany({
        data,
        skipDuplicates: true,
      });
    }
  }
}

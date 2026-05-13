import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  Owner,
  OwnerRegistryLookupResultStatus,
  Party,
  PartyIdentifierType,
  PartyStatus,
  PartyType,
} from '@prisma/client';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { OwnersController } from '../src/modules/owners/owners.controller';
import { OwnerProvisioningService } from '../src/modules/owners/owner-provisioning.service';
import { OwnersRepo } from '../src/modules/owners/owners.repo';
import { OwnersService } from '../src/modules/owners/owners.service';
import { PartyIdentifierService } from '../src/modules/parties/party-identifier.service';
import { PartyResolutionService } from '../src/modules/parties/party-resolution.service';
import { PartyResolutionTokenService } from '../src/modules/parties/party-resolution-token.service';

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
};

type PartyIdentifierRecord = {
  id: string;
  partyId: string;
  identifierType: PartyIdentifierType;
  countryCode: string | null;
  issuingAuthority: string | null;
  valueEncrypted: string;
  lookupHmac: string;
  last4: string | null;
  isPrimary: boolean;
  isVerified: boolean;
  normalizationVersion: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type OwnerRegistryLookupAuditRecord = {
  id: string;
  actorUserId: string;
  actorOrgId: string;
  identifierType: PartyIdentifierType;
  lookupHmac: string;
  resultStatus: OwnerRegistryLookupResultStatus;
  matchedPartyId: string | null;
  createdAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private users: UserRecord[] = [];
  private parties: Party[] = [];
  private partyIdentifiers: PartyIdentifierRecord[] = [];
  private owners: Owner[] = [];
  private audits: OwnerRegistryLookupAuditRecord[] = [];

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.users.find((user) => user.id === where.id) ?? null;
    },
  };

  party = {
    create: async ({
      data,
    }: {
      data: {
        type: PartyType;
        displayNameEn: string;
        displayNameAr: string | null;
        primaryEmail: string | null;
        primaryPhone: string | null;
      };
    }) => {
      const now = new Date();
      const created: Party = {
        id: randomUUID(),
        type: data.type,
        displayNameEn: data.displayNameEn,
        displayNameAr: data.displayNameAr,
        primaryEmail: data.primaryEmail,
        primaryPhone: data.primaryPhone,
        status: PartyStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      };
      this.parties.push(created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Party>;
    }) => {
      const party = this.parties.find((item) => item.id === where.id);
      if (!party) {
        throw new Error('Party not found');
      }
      Object.assign(party, data, { updatedAt: new Date() });
      return party;
    },
  };

  partyIdentifier = {
    findFirst: async ({
      where,
      include,
    }: {
      where: {
        identifierType: PartyIdentifierType;
        countryCode: string | null;
        issuingAuthority: string | null;
        lookupHmac: string;
        deletedAt: null;
      };
      include?: { party?: boolean };
    }) => {
      const identifier =
        this.partyIdentifiers.find(
          (item) =>
            item.identifierType === where.identifierType &&
            item.countryCode === where.countryCode &&
            item.issuingAuthority === where.issuingAuthority &&
            item.lookupHmac === where.lookupHmac &&
            item.deletedAt === null,
        ) ?? null;
      if (!identifier) {
        return null;
      }
      if (!include?.party) {
        return identifier;
      }
      const party =
        this.parties.find((item) => item.id === identifier.partyId) ?? null;
      return {
        ...identifier,
        party,
      };
    },
    create: async ({
      data,
    }: {
      data: {
        partyId: string;
        identifierType: PartyIdentifierType;
        countryCode: string | null;
        issuingAuthority: string | null;
        valueEncrypted: string;
        lookupHmac: string;
        last4: string | null;
        normalizationVersion: number;
        isPrimary: boolean;
      };
    }) => {
      const now = new Date();
      const created: PartyIdentifierRecord = {
        id: randomUUID(),
        partyId: data.partyId,
        identifierType: data.identifierType,
        countryCode: data.countryCode,
        issuingAuthority: data.issuingAuthority,
        valueEncrypted: data.valueEncrypted,
        lookupHmac: data.lookupHmac,
        last4: data.last4,
        isPrimary: data.isPrimary,
        isVerified: false,
        normalizationVersion: data.normalizationVersion,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      this.partyIdentifiers.push(created);
      return created;
    },
  };

  ownerRegistryLookupAudit = {
    create: async ({
      data,
    }: {
      data: Omit<OwnerRegistryLookupAuditRecord, 'id' | 'createdAt'>;
    }) => {
      const created: OwnerRegistryLookupAuditRecord = {
        id: randomUUID(),
        createdAt: new Date(),
        ...data,
      };
      this.audits.push(created);
      return created;
    },
  };

  owner = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const owner = this.owners.find((item) => item.id === where.id) ?? null;
      if (!owner) {
        return null;
      }
      const party = owner.partyId
        ? (this.parties.find((item) => item.id === owner.partyId) ?? null)
        : null;
      const identifiers = owner.partyId
        ? this.partyIdentifiers
            .filter(
              (item) =>
                item.partyId === owner.partyId && item.deletedAt === null,
            )
            .sort((a, b) => {
              if (a.isPrimary !== b.isPrimary) {
                return a.isPrimary ? -1 : 1;
              }
              const createdAtDiff =
                b.createdAt.getTime() - a.createdAt.getTime();
              return createdAtDiff !== 0
                ? createdAtDiff
                : b.id.localeCompare(a.id);
            })
            .slice(0, 1)
            .map((item) => ({
              identifierType: item.identifierType,
              last4: item.last4,
              countryCode: item.countryCode,
              issuingAuthority: item.issuingAuthority,
            }))
        : [];
      return {
        ...owner,
        party: party
          ? {
              id: party.id,
              type: party.type,
              displayNameEn: party.displayNameEn,
              displayNameAr: party.displayNameAr,
              identifiers,
            }
          : null,
      };
    },
    findFirst: async ({
      where,
      select,
    }: {
      where: { id?: string; orgId: string; partyId?: string };
      select?: { id?: boolean; isActive?: boolean };
    }) => {
      const owner =
        this.owners.find((item) => {
          if (item.orgId !== where.orgId) {
            return false;
          }
          if (where.id && item.id !== where.id) {
            return false;
          }
          if (where.partyId !== undefined && item.partyId !== where.partyId) {
            return false;
          }
          return true;
        }) ?? null;
      if (!owner) {
        return null;
      }
      if (!select) {
        return owner;
      }
      return {
        ...(select.id ? { id: owner.id } : {}),
        ...(select.isActive !== undefined ? { isActive: owner.isActive } : {}),
      };
    },
    findMany: async ({
      where,
    }: {
      where: {
        orgId: string;
        OR?: Array<{
          name?: { contains: string };
          email?: { contains: string };
          phone?: { contains: string };
          address?: { contains: string };
        }>;
      };
      orderBy: { createdAt: 'desc' };
    }) => {
      let owners = this.owners.filter((owner) => owner.orgId === where.orgId);
      if (where.OR) {
        const term = (
          where.OR.find((entry) => entry.name)?.name?.contains ??
          where.OR.find((entry) => entry.email)?.email?.contains ??
          where.OR.find((entry) => entry.phone)?.phone?.contains ??
          where.OR.find((entry) => entry.address)?.address?.contains ??
          ''
        ).toLowerCase();
        owners = owners.filter((owner) => {
          const fields = [owner.name, owner.email, owner.phone, owner.address];
          return fields.some((field) =>
            field ? field.toLowerCase().includes(term) : false,
          );
        });
      }
      return owners
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    create: async ({
      data,
    }: {
      data: {
        orgId: string;
        partyId: string;
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
        isActive: boolean;
        displayNameOverride: string | null;
        contactEmailOverride: string | null;
        contactPhoneOverride: string | null;
        notes: string | null;
      };
    }) => {
      const now = new Date();
      const created: Owner = {
        id: randomUUID(),
        orgId: data.orgId,
        partyId: data.partyId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        isActive: data.isActive,
        displayNameOverride: data.displayNameOverride,
        contactEmailOverride: data.contactEmailOverride,
        contactPhoneOverride: data.contactPhoneOverride,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
      };
      this.owners.push(created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Owner>;
    }) => {
      const owner = this.owners.find((item) => item.id === where.id);
      if (!owner) {
        throw new Error('Owner not found');
      }
      Object.assign(owner, data, { updatedAt: new Date() });
      return owner;
    },
  };

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<T>[]) {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg(this);
  }

  reset() {
    this.users = [];
    this.parties = [];
    this.partyIdentifiers = [];
    this.owners = [];
    this.audits = [];
  }

  seedUser(input: { email: string; orgId: string | null; isActive?: boolean }) {
    const created: UserRecord = {
      id: randomUUID(),
      email: input.email,
      orgId: input.orgId,
      isActive: input.isActive ?? true,
    };
    this.users.push(created);
    return created;
  }

  listParties() {
    return this.parties.slice();
  }

  listOwners() {
    return this.owners.slice();
  }

  listAudits() {
    return this.audits.slice();
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userHeader = request.headers['x-user-id'];
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return false;
    }
    request.user = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
    };
    return true;
  }
}

@Injectable()
class AllowPermissionsGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('Owner provisioning (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let actorUser: UserRecord;
  let identifierService: PartyIdentifierService;
  let tokenService: PartyResolutionTokenService;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [OwnersController],
      providers: [
        OwnersService,
        OwnersRepo,
        OwnerProvisioningService,
        PartyIdentifierService,
        PartyResolutionService,
        PartyResolutionTokenService,
        OrgScopeGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(AllowPermissionsGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
    identifierService = moduleRef.get(PartyIdentifierService);
    tokenService = moduleRef.get(PartyResolutionTokenService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    prisma.reset();
    actorUser = prisma.seedUser({
      email: 'admin@org-a.test',
      orgId: 'org-a',
    });
  });

  it('reuses the same Party and owner record on exact strong-identifier match', async () => {
    const firstResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        name: 'Jane Owner',
        email: 'jane.owner@org.test',
        identifier: {
          type: PartyIdentifierType.PASSPORT,
          value: 'ab1234567',
          countryCode: 'pk',
        },
      }),
    });
    expect(firstResponse.status).toBe(201);
    const firstBody = await firstResponse.json();

    const secondResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        name: 'Jane Owner Updated',
        email: 'updated.owner@org.test',
        identifier: {
          type: PartyIdentifierType.PASSPORT,
          value: ' AB 1234567 ',
          countryCode: 'PK',
        },
      }),
    });
    expect(secondResponse.status).toBe(201);
    const secondBody = await secondResponse.json();

    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.partyId).toBe(firstBody.partyId);
    expect(secondBody.name).toBe('Jane Owner Updated');
    expect(secondBody.email).toBe('updated.owner@org.test');

    expect(prisma.listParties()).toHaveLength(1);
    expect(prisma.listOwners()).toHaveLength(1);
    const audits = prisma.listAudits();
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => audit.resultStatus)).toEqual([
      OwnerRegistryLookupResultStatus.NO_MATCH,
      OwnerRegistryLookupResultStatus.MATCH_FOUND,
    ]);
  });

  it('reuses the resolved Party when POST /org/owners is given a valid resolution token', async () => {
    const prepared = identifierService.createStoredIdentifierData(
      PartyIdentifierType.EMIRATES_ID,
      '784-1987-1234567-1',
      { countryCode: 'AE', issuingAuthority: 'DUBAI' },
    );
    const party = await prisma.party.create({
      data: {
        type: PartyType.INDIVIDUAL,
        displayNameEn: 'Jane Owner',
        displayNameAr: null,
        primaryEmail: 'jane.owner@org.test',
        primaryPhone: null,
      },
    });
    await prisma.partyIdentifier.create({
      data: {
        partyId: party.id,
        identifierType: PartyIdentifierType.EMIRATES_ID,
        countryCode: 'AE',
        issuingAuthority: 'DUBAI',
        valueEncrypted: prepared.valueEncrypted,
        lookupHmac: prepared.lookupHmac,
        last4: prepared.last4,
        normalizationVersion: prepared.normalizationVersion,
        isPrimary: true,
      },
    });

    const resolutionToken = await tokenService.sign({
      actorUserId: actorUser.id,
      orgId: 'org-a',
      partyId: party.id,
      identifierType: PartyIdentifierType.EMIRATES_ID,
    });

    const firstResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        name: 'Jane Owner',
        email: 'jane.owner@org.test',
        resolutionToken,
      }),
    });
    expect(firstResponse.status).toBe(201);
    const firstBody = await firstResponse.json();

    const secondResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        name: 'Jane Owner Updated',
        email: 'updated.owner@org.test',
        resolutionToken,
      }),
    });
    expect(secondResponse.status).toBe(201);
    const secondBody = await secondResponse.json();

    expect(firstBody.partyId).toBe(party.id);
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.partyId).toBe(party.id);
    expect(secondBody.email).toBe('updated.owner@org.test');
    expect(prisma.listParties()).toHaveLength(1);
    expect(prisma.listOwners()).toHaveLength(1);
  });

  it('creates separate Party records when owner is created without strong identifier', async () => {
    const firstResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        name: 'Weak Owner',
        email: 'weak.owner@org.test',
      }),
    });
    expect(firstResponse.status).toBe(201);
    const firstBody = await firstResponse.json();

    const secondResponse = await fetch(`${baseUrl}/org/owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        name: 'Weak Owner',
        email: 'weak.owner@org.test',
      }),
    });
    expect(secondResponse.status).toBe(201);
    const secondBody = await secondResponse.json();

    expect(secondBody.id).not.toBe(firstBody.id);
    expect(secondBody.partyId).not.toBe(firstBody.partyId);
    expect(prisma.listParties()).toHaveLength(2);
    expect(prisma.listOwners()).toHaveLength(2);
  });
});

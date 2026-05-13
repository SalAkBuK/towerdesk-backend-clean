import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PartyIdentifierType, PartyType } from '@prisma/client';
import { createValidationPipe } from '../src/common/pipes/validation.pipe';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../src/common/guards/org-scope.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { OwnerPartyResolutionController } from '../src/modules/owners/owner-party-resolution.controller';
import { PartyIdentifierService } from '../src/modules/parties/party-identifier.service';
import { PartyResolutionService } from '../src/modules/parties/party-resolution.service';
import { PartyResolutionTokenService } from '../src/modules/parties/party-resolution-token.service';

type UserRecord = {
  id: string;
  email: string;
  orgId: string | null;
  isActive: boolean;
};

type PartyRecord = {
  id: string;
  type: PartyType;
  displayNameEn: string;
  displayNameAr: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
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
  resultStatus: 'MATCH_FOUND' | 'NO_MATCH';
  matchedPartyId: string | null;
  createdAt: Date;
};

let prisma: InMemoryPrismaService;

class InMemoryPrismaService {
  private users: UserRecord[] = [];
  private parties: PartyRecord[] = [];
  private identifiers: PartyIdentifierRecord[] = [];
  private audits: OwnerRegistryLookupAuditRecord[] = [];

  user = {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; email?: string };
    }) => {
      if (where.id) {
        return this.users.find((user) => user.id === where.id) ?? null;
      }
      if (where.email) {
        return this.users.find((user) => user.email === where.email) ?? null;
      }
      return null;
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
        this.identifiers.find(
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

      const party = this.parties.find((item) => item.id === identifier.partyId) ?? null;
      return {
        ...identifier,
        party,
      };
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

  reset() {
    this.users = [];
    this.parties = [];
    this.identifiers = [];
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

  seedParty(input: {
    type: PartyType;
    displayNameEn: string;
    displayNameAr?: string | null;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
  }) {
    const now = new Date();
    const created: PartyRecord = {
      id: randomUUID(),
      type: input.type,
      displayNameEn: input.displayNameEn,
      displayNameAr: input.displayNameAr ?? null,
      primaryEmail: input.primaryEmail ?? null,
      primaryPhone: input.primaryPhone ?? null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.parties.push(created);
    return created;
  }

  seedIdentifier(input: {
    partyId: string;
    identifierType: PartyIdentifierType;
    countryCode?: string | null;
    issuingAuthority?: string | null;
    valueEncrypted: string;
    lookupHmac: string;
    last4?: string | null;
    normalizationVersion?: number;
  }) {
    const now = new Date();
    const created: PartyIdentifierRecord = {
      id: randomUUID(),
      partyId: input.partyId,
      identifierType: input.identifierType,
      countryCode: input.countryCode ?? null,
      issuingAuthority: input.issuingAuthority ?? null,
      valueEncrypted: input.valueEncrypted,
      lookupHmac: input.lookupHmac,
      last4: input.last4 ?? null,
      isPrimary: true,
      isVerified: false,
      normalizationVersion: input.normalizationVersion ?? 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.identifiers.push(created);
    return created;
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

describe('Owner party resolution (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let actorUser: UserRecord;
  let identifierService: PartyIdentifierService;
  let tokenService: PartyResolutionTokenService;

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [OwnerPartyResolutionController],
      providers: [
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

  it('accepts strong identifiers, returns masked data + signed token, and never returns raw identifier', async () => {
    const prepared = identifierService.createStoredIdentifierData(
      PartyIdentifierType.EMIRATES_ID,
      '784-1987-1234567-1',
      { countryCode: 'AE', issuingAuthority: 'DUBAI' },
    );
    const party = prisma.seedParty({
      type: PartyType.INDIVIDUAL,
      displayNameEn: 'Jane Owner',
    });
    prisma.seedIdentifier({
      partyId: party.id,
      identifierType: PartyIdentifierType.EMIRATES_ID,
      countryCode: 'AE',
      issuingAuthority: 'DUBAI',
      valueEncrypted: prepared.valueEncrypted,
      lookupHmac: prepared.lookupHmac,
      last4: prepared.last4,
      normalizationVersion: prepared.normalizationVersion,
    });

    const rawIdentifier = '784-1987-1234567-1';
    const response = await fetch(`${baseUrl}/org/owners/resolve-party`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        identifierType: PartyIdentifierType.EMIRATES_ID,
        identifierValue: rawIdentifier,
        countryCode: 'ae',
        issuingAuthority: ' dubai ',
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      matchFound: true,
      party: {
        partyType: PartyType.INDIVIDUAL,
        displayNameEn: 'Jane Owner',
        displayNameAr: null,
        maskedIdentifier: '***5671',
      },
    });
    expect(typeof body.resolutionToken).toBe('string');
    expect(body.resolutionToken.split('.')).toHaveLength(3);
    expect(JSON.stringify(body)).not.toContain(rawIdentifier);
    expect(JSON.stringify(body)).not.toContain('784198712345671');

    await expect(
      tokenService.verify(body.resolutionToken, actorUser.id, 'org-a'),
    ).resolves.toMatchObject({
      partyId: party.id,
      identifierType: PartyIdentifierType.EMIRATES_ID,
      orgId: 'org-a',
      sub: actorUser.id,
    });
  });

  it('rejects non-strong identifiers on resolve-party', async () => {
    const response = await fetch(`${baseUrl}/org/owners/resolve-party`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        identifierType: PartyIdentifierType.OTHER,
        identifierValue: 'free-text-id',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('stores lookup audits with HMAC only and never raw identifier', async () => {
    const rawIdentifier = 'A12345678';
    const response = await fetch(`${baseUrl}/org/owners/resolve-party`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': actorUser.id,
      },
      body: JSON.stringify({
        identifierType: PartyIdentifierType.PASSPORT,
        identifierValue: rawIdentifier,
        countryCode: 'PK',
      }),
    });
    expect(response.status).toBe(201);

    const audits = prisma.listAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: actorUser.id,
      actorOrgId: 'org-a',
      identifierType: PartyIdentifierType.PASSPORT,
      resultStatus: 'NO_MATCH',
      matchedPartyId: null,
    });
    expect(audits[0].lookupHmac).toMatch(/^[a-f0-9]{64}$/);
    expect(audits[0].lookupHmac).not.toContain(rawIdentifier);
    expect(JSON.stringify(audits[0])).not.toContain(rawIdentifier);
  });
});

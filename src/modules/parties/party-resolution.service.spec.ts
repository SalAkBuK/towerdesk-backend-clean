import { PartyIdentifierType, PartyType } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PartyIdentifierService } from './party-identifier.service';
import { PartyResolutionService } from './party-resolution.service';

describe('PartyResolutionService', () => {
  let prisma: {
    partyIdentifier: { findFirst: jest.Mock; create: jest.Mock };
    ownerRegistryLookupAudit: { create: jest.Mock };
    party: { create: jest.Mock; update: jest.Mock };
  };
  let identifierService: PartyIdentifierService;
  let service: PartyResolutionService;

  beforeEach(() => {
    prisma = {
      partyIdentifier: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      ownerRegistryLookupAudit: {
        create: jest.fn(),
      },
      party: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    identifierService = new PartyIdentifierService();
    service = new PartyResolutionService(
      prisma as unknown as PrismaService,
      identifierService,
    );
  });

  it('resolves an exact identifier match and audits the HMAC lookup only', async () => {
    prisma.partyIdentifier.findFirst.mockResolvedValue({
      partyId: 'party-1',
      party: {
        id: 'party-1',
        type: PartyType.INDIVIDUAL,
        displayNameEn: 'Jane Owner',
        displayNameAr: null,
        primaryEmail: 'jane@example.com',
        primaryPhone: '+971500000000',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    prisma.ownerRegistryLookupAudit.create.mockResolvedValue({});

    const result = await service.findPartyByIdentifierExact(
      { userId: 'user-1', orgId: 'org-1' },
      {
        identifierType: PartyIdentifierType.EMIRATES_ID,
        identifierValue: '784-1987-1234567-1',
        countryCode: 'ae',
        issuingAuthority: ' dubai ',
      },
    );

    expect(result.matchFound).toBe(true);
    expect(result.party?.id).toBe('party-1');
    expect(result.maskedIdentifier).toBe('***5671');
    expect(prisma.partyIdentifier.findFirst).toHaveBeenCalledWith({
      where: {
        identifierType: PartyIdentifierType.EMIRATES_ID,
        countryCode: 'AE',
        issuingAuthority: 'DUBAI',
        lookupHmac: result.lookupHmac,
        deletedAt: null,
      },
      include: {
        party: true,
      },
    });

    expect(prisma.ownerRegistryLookupAudit.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'user-1',
        actorOrgId: 'org-1',
        identifierType: PartyIdentifierType.EMIRATES_ID,
        lookupHmac: result.lookupHmac,
        resultStatus: 'MATCH_FOUND',
        matchedPartyId: 'party-1',
      },
    });
    expect(
      JSON.stringify(prisma.ownerRegistryLookupAudit.create.mock.calls[0][0]),
    ).not.toContain('784-1987-1234567-1');
  });

  it('records a no-match audit without exposing raw identifier input', async () => {
    prisma.partyIdentifier.findFirst.mockResolvedValue(null);
    prisma.ownerRegistryLookupAudit.create.mockResolvedValue({});

    const result = await service.findPartyByIdentifierExact(
      { userId: 'user-2', orgId: 'org-2' },
      {
        identifierType: PartyIdentifierType.PASSPORT,
        identifierValue: ' aa1234567 ',
        countryCode: 'pk',
      },
    );

    expect(result).toMatchObject({
      matchFound: false,
      party: null,
      maskedIdentifier: '***4567',
      normalizedContext: {
        countryCode: 'PK',
        issuingAuthority: null,
      },
    });
    expect(prisma.ownerRegistryLookupAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'user-2',
        actorOrgId: 'org-2',
        identifierType: PartyIdentifierType.PASSPORT,
        resultStatus: 'NO_MATCH',
        matchedPartyId: null,
      }),
    });
    expect(
      JSON.stringify(prisma.ownerRegistryLookupAudit.create.mock.calls[0][0]),
    ).not.toContain('aa1234567');
    expect(result).not.toHaveProperty('normalizedValue');
  });

  it('rejects non-strong identifiers for resolution', async () => {
    await expect(
      service.findPartyByIdentifierExact(
        { userId: 'user-1', orgId: 'org-1' },
        {
          identifierType: PartyIdentifierType.OTHER,
          identifierValue: 'custom-identifier',
        },
      ),
    ).rejects.toThrow(
      'Only strong identifier types are allowed for resolution',
    );
  });

  it('does not silently swallow identifier-create conflicts', async () => {
    const conflict = new Error('Unique constraint failed');
    prisma.partyIdentifier.create.mockRejectedValue(conflict);

    await expect(
      service.createIdentifier('party-1', {
        identifierType: PartyIdentifierType.EMIRATES_ID,
        identifierValue: '784-1987-1234567-1',
      }),
    ).rejects.toBe(conflict);
  });
});

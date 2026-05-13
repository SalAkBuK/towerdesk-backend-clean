import { PartyIdentifierType } from '@prisma/client';
import { PartyIdentifierService } from './party-identifier.service';

describe('PartyIdentifierService', () => {
  let service: PartyIdentifierService;

  beforeEach(() => {
    service = new PartyIdentifierService();
  });

  it('normalizes strong identifiers consistently for lookup and storage', () => {
    const normalized = service.normalizeIdentifier(
      PartyIdentifierType.EMIRATES_ID,
      ' 784-1987-1234567-1 ',
    );

    expect(normalized).toBe('784198712345671');
    expect(
      service.buildLookupHmac(PartyIdentifierType.EMIRATES_ID, normalized, {
        countryCode: 'ae',
        issuingAuthority: ' dubai ',
      }),
    ).toBe(
      service.buildLookupHmac(
        PartyIdentifierType.EMIRATES_ID,
        '784198712345671',
        { countryCode: 'AE', issuingAuthority: 'DUBAI' },
      ),
    );
  });

  it('encrypts stored values without exposing the raw identifier and decrypts them back', () => {
    const stored = service.createStoredIdentifierData(
      PartyIdentifierType.PASSPORT,
      ' ab1234567 ',
      { countryCode: 'pk' },
    );

    expect(stored.normalizedValue).toBe('AB1234567');
    expect(stored.valueEncrypted).not.toContain('AB1234567');
    expect(stored.lookupHmac).not.toContain('AB1234567');
    expect(service.decryptValue(stored.valueEncrypted)).toBe('AB1234567');
    expect(stored.last4).toBe('4567');
  });

  it('masks identifiers before they leave the resolution layer', () => {
    expect(
      service.maskIdentifier(PartyIdentifierType.TRADE_LICENSE, 'CN123456789'),
    ).toBe('***6789');
  });
});

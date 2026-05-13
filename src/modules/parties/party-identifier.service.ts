import { BadRequestException, Injectable } from '@nestjs/common';
import { PartyIdentifierType } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';
import { env } from '../../config/env';

type IdentifierContext = {
  countryCode?: string | null;
  issuingAuthority?: string | null;
};

@Injectable()
export class PartyIdentifierService {
  private readonly encryptionKey = createHash('sha256')
    .update(env.OWNER_IDENTIFIER_ENCRYPTION_KEY)
    .digest();

  normalizeIdentifier(type: PartyIdentifierType, rawValue: string) {
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException('Identifier value is required');
    }

    switch (type) {
      case PartyIdentifierType.EMIRATES_ID:
      case PartyIdentifierType.TRADE_LICENSE:
      case PartyIdentifierType.VAT_TRN:
        return value.toUpperCase().replace(/[\s-]/g, '');
      case PartyIdentifierType.PASSPORT:
        return value.toUpperCase().replace(/\s+/g, '');
      case PartyIdentifierType.OTHER:
      default:
        return value.toUpperCase();
    }
  }

  normalizeContext(input?: IdentifierContext) {
    return {
      countryCode: input?.countryCode?.trim().toUpperCase() || null,
      issuingAuthority: input?.issuingAuthority?.trim().toUpperCase() || null,
    };
  }

  buildLookupHmac(
    type: PartyIdentifierType,
    normalizedValue: string,
    input?: IdentifierContext,
  ) {
    const context = this.normalizeContext(input);
    const payload = [
      'v1',
      type,
      context.countryCode ?? '',
      context.issuingAuthority ?? '',
      normalizedValue,
    ].join('|');

    return createHmac('sha256', env.OWNER_IDENTIFIER_HMAC_KEY)
      .update(payload)
      .digest('hex');
  }

  maskIdentifier(type: PartyIdentifierType, normalizedValue: string) {
    const visible = normalizedValue.slice(-4);
    if (!visible) {
      return '***';
    }

    switch (type) {
      case PartyIdentifierType.EMIRATES_ID:
      case PartyIdentifierType.PASSPORT:
      case PartyIdentifierType.TRADE_LICENSE:
      case PartyIdentifierType.VAT_TRN:
      case PartyIdentifierType.OTHER:
      default:
        return `***${visible}`;
    }
  }

  encryptValue(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  decryptValue(cipherText: string) {
    const [ivRaw, tagRaw, encryptedRaw] = cipherText.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) {
      throw new BadRequestException('Invalid encrypted identifier');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivRaw, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  createStoredIdentifierData(
    type: PartyIdentifierType,
    rawValue: string,
    input?: IdentifierContext,
  ) {
    const normalizedValue = this.normalizeIdentifier(type, rawValue);
    return {
      normalizedValue,
      lookupHmac: this.buildLookupHmac(type, normalizedValue, input),
      valueEncrypted: this.encryptValue(normalizedValue),
      last4: normalizedValue.slice(-4) || null,
      normalizationVersion: 1,
      ...this.normalizeContext(input),
    };
  }
}

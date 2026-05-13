# Parties Review

## Scope

- Source: `src/modules/parties`
- Main files:
  - `party-identifier.service.ts`
  - `party-resolution.service.ts`
  - `party-resolution-token.service.ts`
  - `parties.module.ts`
- Public HTTP routes: none directly (used by owners module).
- Used by: owner identity resolution and owner provisioning flows.
- Core responsibility: normalize strong identifiers, resolve existing party identity safely, and mint resolution tokens.

## What This Module Really Owns

- Identifier normalization policy and masking rules.
- Secure derivation for lookup (`lookupHmac`) and encrypted storage.
- Party resolution lookup semantics + audit trail.
- Owner-party resolution tokens (JWT-based) for follow-on workflows.

## Step-By-Step Request Flows

### 1. Normalize and store an identifier (internal flow)

1. Caller provides:
   - `identifierType`
   - raw identifier value
   - optional `countryCode` and `issuingAuthority`
2. `PartyIdentifierService.normalizeIdentifier(...)`:
   - trims whitespace
   - normalizes per identifier type:
     - `EMIRATES_ID`, `TRADE_LICENSE`, `VAT_TRN`: uppercase, remove spaces and dashes
     - `PASSPORT`: uppercase, remove whitespace
     - `OTHER`: uppercase only
3. `normalizeContext(...)` uppercases and trims country and authority.
4. `buildLookupHmac(...)`:
   - builds a versioned payload `v1|type|country|authority|value`
   - computes HMAC SHA-256 with `OWNER_IDENTIFIER_HMAC_KEY`
5. `encryptValue(...)`:
   - AES-256-GCM with random IV
   - key derived from `OWNER_IDENTIFIER_ENCRYPTION_KEY`
6. Output stored fields:
   - `lookupHmac`
   - `valueEncrypted`
   - `last4`
   - `normalizationVersion`
   - `countryCode`, `issuingAuthority`

### 2. Resolve a party by identifier (owner flows)

1. Caller provides actor scope and identifier input.
2. `PartyResolutionService.assertStrongIdentifier(...)`:
   - rejects `OTHER` as non-strong identifier type.
3. Identifier is normalized, HMAC’ed, encrypted (same logic as above).
4. `partyIdentifier.findFirst` query uses:
   - `identifierType`
   - normalized context (`countryCode`, `issuingAuthority`)
   - `lookupHmac`
   - `deletedAt = null`
5. Audit record is written:
   - `ownerRegistryLookupAudit` stores lookup HMAC only
   - status: `MATCH_FOUND` or `NO_MATCH`
6. Response includes:
   - `matchFound`
   - `party` (if found)
   - `lookupHmac`
   - `maskedIdentifier`
   - `normalizedContext`
7. Raw identifiers never leave the service boundary.

### 3. Create party + identifier (provisioning)

1. `createParty(...)` writes a `Party` with type and display name.
2. `createIdentifier(...)`:
   - reuses normalization + HMAC + encryption
   - writes `partyIdentifier` with `isPrimary = true`
3. Conflicts (unique constraints) are surfaced; not swallowed.

### 4. Issue and verify resolution token

1. `PartyResolutionTokenService.sign(...)`:
   - builds JWT payload:
     - `sub` (actor user id)
     - `orgId`
     - `partyId`
     - `identifierType`
     - `purpose = owner-party-resolution`
   - signs with `OWNER_RESOLUTION_TOKEN_SECRET`
   - uses `OWNER_RESOLUTION_TOKEN_TTL_SECONDS` for expiry
2. `verify(...)`:
   - validates JWT signature and expiry
   - confirms `purpose`, `sub`, and `orgId` match expected actor scope
   - invalid token -> `401`
   - mismatched scope -> `400`

## Validation And Defaults

### Identifier type rules

- Strong types allowed for resolution:
  - `EMIRATES_ID`, `TRADE_LICENSE`, `VAT_TRN`, `PASSPORT`
- `OTHER` is rejected for resolution flows.

### Context normalization

- `countryCode` and `issuingAuthority` are optional.
- Both are uppercased and trimmed.

### Masking

- All identifier types are masked as `***` plus last 4 characters.
- If less than 4 characters exist, returns `***`.

### Encryption

- AES-256-GCM with random IV per record.
- Stored format: `iv.tag.ciphertext` in base64.

## Data And State Model

### Core tables touched

- `Party`
- `PartyIdentifier`
- `OwnerRegistryLookupAudit`

### Derived fields and secrets

- `lookupHmac` is derived from normalized values.
- `valueEncrypted` stores the normalized identifier under AES-256-GCM.
- Raw identifiers are not persisted directly.

## Edge Cases And Important Scenarios

### Non-strong identifier types

- Any attempt to resolve `OTHER` returns `400 Bad Request`.

### Audit safety

- Audit logs store `lookupHmac` only, not raw identifiers.
- Tests assert that raw input never appears in audit payloads.

### Token scope enforcement

- Tokens are bound to actor user and org.
- A valid token from another user or org fails verification.

### Normalization versioning

- `normalizationVersion` is stored but only `v1` is currently used.
- Changing normalization rules requires version bump or dual-lookup strategy.

## Strengths

- Strong privacy posture: raw identifiers never leave the service boundary.
- Consistent normalization for lookup and encryption.
- Audit records are safe for storage and review.
- Token verification is scoped to actor and org.

## Risks And Design Weaknesses

### 1. Key rotation is not defined

- HMAC and encryption keys are assumed stable.
- Rotation or dual-lookup behavior is not described or implemented.

### 2. Normalization changes could break matching

- Any change in normalization rules will change lookup HMACs.
- Historical identifiers might become unresolvable without migration.

### 3. Token TTL is configuration-only

- No safeguards for exceptionally long TTLs.
- Token issuance is not audited in this module.

## Improvement Opportunities

### High priority

- Document key-rotation and normalization-version strategy.
- Define the allowed identifier types and expected formatting per country.

### Medium priority

- Add auditing for token issuance (or ensure it exists upstream).
- Add duplicate detection/reporting for identifiers across parties.

### Lower priority

- Expose metrics on resolution match rates for support visibility.
- Add envelope encryption or KMS integration if required.

## Concrete Review Questions For Your Lead

1. Do we need key rotation and normalization version migration policies now?
2. Should token issuance be audited and tied to a specific owner workflow step?
3. Are the current identifier normalization rules sufficient for all supported countries?
4. Should non-strong identifiers ever be allowed for resolution in controlled flows?
5. Is masking with last 4 digits acceptable for all identifier types?

## Testing Signals

### Unit coverage already present

- `src/modules/parties/party-identifier.service.spec.ts`
- `src/modules/parties/party-resolution.service.spec.ts`

### Integration coverage already present

- `test/owner-party-resolution.e2e.spec.ts`

### Notable cases already tested

- normalization and HMAC consistency
- encryption/decryption of identifiers
- masked identifier output
- resolution auditing without raw identifier exposure
- rejection of non-strong identifier types

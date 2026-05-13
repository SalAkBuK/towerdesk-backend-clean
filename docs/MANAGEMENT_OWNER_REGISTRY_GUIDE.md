# Management Guide: Owners, Parties, And Identifier Matching

This guide is for management staff, admins, support, and product/frontend teams that need to explain the owner-creation flow in plain language.

It is not an API spec.

## Why This Exists

An "owner" in Towerdesk is not always just a single row tied to one org forever.

The system separates:

- the real-world person or company
- the org-specific owner record used by one management company

That split is what makes owner onboarding, deduplication, and cross-org identity matching work safely.

## The 3 Concepts

### 1. Party

A `Party` is the real-world identity.

Examples:

- an individual owner
- a company owner

Think of this as:

"Who is this person or company in real life?"

One party can appear in multiple orgs.

### 2. Owner

An `Owner` is the org-local record used by one management company.

Think of this as:

"How does this org represent that owner in its own system?"

This record can hold org-specific values like:

- local contact details
- display overrides
- notes
- local status

One real person can have:

- one `Party`
- multiple `Owner` records
- one owner record per org

### 3. Identifier

A `PartyIdentifier` is the strong proof used to recognize the same real-world party.

Examples:

- Emirates ID
- Passport
- Trade License
- VAT TRN

Think of this as:

"What strong legal identifier can prove this is the same person or company?"

## The Main Idea In One Example

Jane owns property in two different management companies.

Without party matching:

- Org A creates owner `Jane Owner`
- Org B creates owner `Jane Owner`
- backend treats them as two unrelated people

With party matching:

- backend stores one `Party` for Jane
- Org A has its own `Owner` linked to that party
- Org B has its own `Owner` linked to that same party

So:

- the person is shared
- the org-local owner record is separate

This is the whole point of `partyId`.

## Why Not Just Match By Email Or Phone?

Because email and phone are weak identifiers.

They can:

- change
- be mistyped
- be shared
- differ across orgs

Strong identifiers are better for deduplication.

That is why the system uses identifiers like Emirates ID, passport, trade license, and VAT TRN for party resolution.

## Why The Identifier Is Stored This Way

The backend does not rely on raw plaintext IDs for lookup.

It:

- normalizes the value
- builds a lookup HMAC
- stores an encrypted value
- stores a masked version for display

This gives the system:

- reliable matching
- privacy-safe storage
- safer audit behavior

Management users should never need to understand the cryptography. They only need to know:

- exact identifier matches are used to avoid duplicate parties
- the full raw identifier is not shown back in normal UI

## What Management Staff Are Actually Doing

When staff create an owner, they are doing one of three things:

1. linking this org to an already-known real-world person/company
2. creating a brand new real-world person/company
3. creating an org-local owner record without a strong identifier yet

## Recommended Management Workflow

### Normal Flow

1. Start owner creation
2. Enter owner basics
3. If a strong identifier is available, search by identifier first
4. If a match is found, reuse that matched party
5. Create or update the org-local owner record for this org

### Fallback Flow

If no strong identifier is available:

1. create the owner without identifier matching
2. system creates a new party
3. owner can still function normally in this org

This is less ideal for deduplication, but still valid.

## What "Resolve Party" Means

"Resolve party" means:

"Check whether this identifier already belongs to an existing real-world person or company."

This does not create the owner by itself.

It only answers:

- did we find a match?
- if yes, should we reuse that party?

## What The Resolution Token Is For

If the backend finds a matching party, it returns a short-lived `resolutionToken`.

This token exists so the create-owner request can safely say:

"I want to create this owner using the already-resolved party you just found."

Why this matters:

- frontend does not need to pass raw identity linkage decisions blindly
- backend can verify that the user really resolved that party just before creating the owner
- the create step becomes safer and simpler

## What Happens During Owner Creation

When management submits owner creation, backend does this:

### Case A: Resolution Token Exists

- backend trusts the recent party match
- reuses that `partyId`
- creates or updates the org-local owner for this org

### Case B: No Token, But Identifier Was Provided

- backend looks for an exact identifier match
- if match exists, it reuses that party
- if no match exists, it creates:
  - a new `Party`
  - a new `PartyIdentifier`
  - a new org-local `Owner`

### Case C: No Identifier Provided

- backend creates a new `Party`
- backend creates a new org-local `Owner`

## Important Rule: Owners Are Unique Per Org Per Party

Inside one org, the same party should not become two separate owner rows.

That means:

- if Org A already has an owner linked to `party_123`
- and staff tries to create the same party again
- backend should reuse/update that owner instead of duplicating it

So management gets:

- one owner row per party per org
- multiple orgs can still point to the same party

## When Staff Should Search By Identifier First

Use identifier resolution when:

- onboarding a serious owner record
- strong legal ID is available
- there is a real chance this owner exists in another org

Best cases:

- institutional owners
- repeat investors
- known owners moving between management companies
- owners with multiple units across orgs

## When It Is Fine To Skip Identifier Matching

Skip it when:

- identifier is not available yet
- ops team only has basic contact info
- onboarding must happen quickly

The owner can still be created.

The tradeoff is:

- deduplication is weaker
- later reconciliation may be needed

## What Staff Should See In The UI

The UI should explain the flow in business language, not technical terms.

Recommended wording:

- "Search existing owner identity"
- "Check if this owner already exists"
- "Match by Emirates ID / Passport / Trade License"
- "Use existing owner identity"
- "Create new owner identity"

Avoid showing raw backend terms directly to management users like:

- partyId
- HMAC
- resolution token
- normalization version

## Recommended UI Tutorial Copy

### Short Version

"Towerdesk can check whether this owner already exists using a strong identifier such as Emirates ID, passport, or trade license. If a match is found, your org will reuse that identity instead of creating a duplicate owner."

### Match Found

"A matching owner identity was found. Continue to create this owner for your org using the existing identity."

### No Match Found

"No matching owner identity was found. Towerdesk will create a new owner identity and link it to this org."

### No Identifier Available

"You can continue without an identifier. This creates the owner for your org, but duplicate detection across orgs will be weaker."

## Common Management Scenarios

### Scenario 1: Same Person, New Org

- staff enters strong identifier
- system finds a match
- org gets a new owner row linked to the existing party

Good outcome:

- same real person
- separate org-level record

### Scenario 2: Same Person, Same Org

- staff enters strong identifier
- system finds existing party already linked in this org
- backend should reuse/update the existing owner record

Good outcome:

- no duplicate owner rows in the same org

### Scenario 3: Brand New Owner

- strong identifier does not match anything
- backend creates party, identifier, and owner

Good outcome:

- new canonical identity is created once

### Scenario 4: No Identifier Yet

- staff skips identifier
- backend creates party and owner

Acceptable outcome:

- onboarding still works
- later matching may be harder

## Good Training Rule For Management

Tell management staff:

"If you have a strong legal identifier, use it before creating the owner. If you do not, continue anyway, but know that duplicate prevention is weaker."

## Good Training Rule For Product / Frontend

Tell product and frontend teams:

"The technical model is Party -> Owner, but the user-facing workflow should feel like a guided duplicate-check during owner creation."

## Suggested Screen Flow

### Option A: Guided Stepper

1. Owner basics
2. Identity check
3. Match result
4. Confirm org-specific details
5. Create owner

### Option B: Single Form With Smart Check

1. Enter owner basics
2. Optional identifier section
3. "Check existing owner identity" button
4. Show:
   - match found
   - no match found
   - continue without identifier

## What To Document For Operations

If you are building an internal admin handbook, include:

- what an owner is
- what a shared identity is
- when to use identifier lookup
- when to continue without identifier
- why one person can appear in multiple orgs
- why one org should not have duplicate owner rows for the same party

## Simple Plain-English Summary

- `Party` = the real person or company
- `Owner` = this org's record for that person or company
- `Identifier` = the strong ID used to recognize the same party again

If you remember only one sentence, remember this:

"Towerdesk uses identifiers to avoid creating duplicate real-world owners, while still letting each org keep its own owner record."

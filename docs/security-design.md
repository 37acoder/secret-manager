# Security Design

This document describes the intended SecretManager security model and the parts already represented in this prototype.

Important status note: the current `apps/web` routes use a demo-safe in-memory store with fake values so the interaction model can be validated quickly. The reusable crypto package and Prisma schema define the intended encrypted persistence boundary, but the web demo is not a production secret store yet.

## Security Goals

- Secret values are masked by default in UI, ordinary API reads, logs, audit rows, tests, and screenshots.
- Plaintext appears only in explicit high-risk flows: reveal, copy, plaintext export, and local CLI plaintext output.
- Secret values are encrypted at rest before durable persistence.
- Audit events identify sensitive actions without recording raw values.
- Master keys are configured outside the repository and outside the database.

## Encryption Algorithm

The crypto package uses Node.js `crypto` with:

- algorithm: `aes-256-gcm`;
- key size: 32 bytes;
- nonce size: 12 bytes;
- authentication tag: GCM auth tag returned by Node.js crypto.

AES-GCM provides confidentiality and integrity for each encrypted payload. Decryption fails if ciphertext, nonce, auth tag, encrypted DEK, or key version metadata is incorrect.

## Envelope Encryption Method

Each secret version uses envelope encryption:

1. Generate a random 32-byte data-encryption key, or DEK, for the secret version.
2. Generate a random 12-byte nonce for the secret value.
3. Encrypt the UTF-8 secret value with AES-256-GCM using the DEK.
4. Generate a second random 12-byte nonce for the DEK.
5. Encrypt the DEK with AES-256-GCM using the active master key from `SM_MASTER_KEY`.
6. Store ciphertext, value nonce, value auth tag, encrypted DEK, DEK nonce, DEK auth tag, and master key version.

The raw DEK is not persisted. It exists only in process memory during encryption or decryption.

## Master Key Handling

`SM_MASTER_KEY` must be a base64-encoded 32-byte key. The loader rejects missing keys and keys that do not decode to exactly 32 bytes.

`SM_KEY_VERSION` identifies the active master key version and must look like `v1`, `v2`, and so on. If omitted, the prototype defaults to `v1`.

Operational rules:

- Do not commit master keys.
- Provide master keys through environment variables or a deployment secret store.
- Back up the master key separately from the database.
- Rotate by adding a new active version and retaining historical versions until old secret versions are re-encrypted or retired.
- Missing historical keys make older secret versions undecryptable.

## Persisted Storage Shape

The Prisma schema models durable encrypted storage in `SecretVersion`:

- `ciphertext`: encrypted secret value, base64 encoded.
- `nonce`: nonce used for value encryption, base64 encoded.
- `authTag`: authentication tag for the encrypted value.
- `encryptedDek`: encrypted data-encryption key, base64 encoded.
- `dekNonce`: nonce used while encrypting the DEK.
- `dekAuthTag`: authentication tag for the encrypted DEK.
- `encryptionKeyVersion`: master key version used to encrypt the DEK.
- `contentType`: type hint such as `text`, `json`, or `env`.
- `fingerprint`: optional non-secret lookup/debug fingerprint.

Non-sensitive metadata such as project, vault, key name, description, version number, actor, and timestamps can be stored in normal relational columns.

## Demo Store Limitation

The web MVP currently uses `apps/web/lib/secret-service.ts`, an in-memory demo store attached to `globalThis`. It masks values for reads and keeps fake demo values only. This keeps fundraising/demo screenshots safe and lets the UI be tested without a database dependency.

Before production use, the web route handlers must be wired to the Prisma persistence layer and `packages/crypto` encryption functions. Until that is complete, do not use the web app for real secrets.

## Redaction

`packages/crypto` includes redaction helpers for log and snapshot boundaries. Keys matching sensitive patterns are replaced with `[REDACTED]`.

Sensitive key patterns include:

- `value`
- `secret`
- `token`
- `authorization`
- `cookie`
- `SM_MASTER_KEY`

Use redaction helpers before logging structured errors, request-like objects, audit metadata, or test snapshots.

## Plaintext Exposure Boundary

Plaintext may appear only in these explicit paths:

- `POST /api/secrets/:secretId/reveal`
- `POST /api/secrets/:secretId/copy`
- confirmed plaintext `.env` export;
- local CLI `get` and `export` output.

Plaintext must not appear in:

- table/list/detail reads;
- audit rows;
- logs;
- screenshots;
- issue comments;
- docs except fake examples;
- API token metadata;
- database backups.

## Import And Export Safety

Import:

- `.env` content is previewed before writes.
- Rows are classified as valid, duplicate, or invalid.
- Preview values stay masked.
- Duplicate rows require skip or overwrite behavior.

Export:

- Encrypted backup is the default safe path.
- Plaintext `.env` export requires explicit confirmation.
- Screenshot-safe mode hides plaintext output and disables reveal/copy/plaintext display.
- Export creates audit evidence.

## Audit Model

Audit events should record:

- actor type and actor id or token id;
- action;
- target type and target id;
- outcome;
- request id;
- timestamp;
- safe metadata.

Audit events must not store plaintext secret values, raw tokens, cookies, authorization headers, master keys, or unredacted request bodies.

## API Token Storage

The Prisma schema stores API tokens as:

- `tokenPrefix`: display/search prefix;
- `tokenHash`: full token hash;
- `scopes`: permitted operations;
- `expiresAt`, `lastUsedAt`, and `revokedAt`.

Full tokens should be shown once at creation. After that, only prefix, scope, and lifecycle metadata should be visible.

## Backups

Database backups should contain ciphertext and metadata only. A database backup without the matching master key should not be enough to decrypt secrets.

The master key must be backed up by Infra through a separate secret-management process. Losing the master key loses access to encrypted values.

## Current Non-Goals

These are intentionally out of scope for the MVP:

- KMS/HSM/BYOK integration;
- hosted SaaS multi-tenancy;
- SSO/SAML/SCIM;
- automatic rotation;
- leak scanning;
- high availability;
- disaster recovery automation;
- browser extension storage.

## Production Hardening Checklist

Before using real secrets:

- Wire web route handlers to Prisma storage and `packages/crypto`.
- Add authentication and authorization around every project, vault, token, and secret operation.
- Store password hashes and API token hashes with reviewed algorithms and parameters.
- Add request IDs and centralized redacted logging.
- Add rate limits for login, reveal, copy, export, and token creation.
- Add master-key rotation and historical-key loading.
- Add backup and restore drills.
- Add security review for deployment configuration, cookies, CSP, and TLS.

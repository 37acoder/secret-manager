# Security Design

This document describes the intended SecretManager security model and the parts already represented in this prototype.

Important status note: the current `apps/web` routes use a local in-memory store so the product can run without infrastructure, but secret values are no longer stored as raw plaintext. Vault passwords derive short-lived symmetric keys, and secret versions store encrypted payloads plus masked metadata. The next production hardening step is to replace the in-memory store with Prisma persistence while keeping the same password-derived encryption boundary.

## Security Goals

- Secret values are masked by default in UI, ordinary API reads, logs, audit rows, tests, and screenshots.
- Plaintext appears only in explicit high-risk flows: reveal, copy, plaintext export, and local CLI plaintext output.
- Secret values are encrypted at rest before durable persistence.
- Audit events identify sensitive actions without recording raw values.
- Vault passwords are never stored.
- Short-lived decrypt keys are cleared when the vault locks or the browser leaves the page.

## Encryption Algorithm

The running web MVP uses Node.js `crypto` with:

- algorithm: `aes-256-gcm`;
- key size: 32 bytes;
- nonce size: 12 bytes;
- authentication tag: GCM auth tag returned by Node.js crypto.

AES-GCM provides confidentiality and integrity for each encrypted payload. Decryption fails if ciphertext, nonce, auth tag, or verifier metadata is incorrect.

## Password-Derived Vault Encryption

Each vault has a user-provided password:

1. User sets or enters a vault password, 6-20 characters.
2. Server generates a random salt for the vault.
3. Server derives a 32-byte symmetric vault key using `scrypt(password, salt)`.
4. Server stores an encrypted verifier payload, not the password.
5. For every secret version, server generates a random 12-byte nonce.
6. Server encrypts the UTF-8 secret value with AES-256-GCM using the derived vault key.
7. Server stores ciphertext, nonce, auth tag, masked value metadata, version metadata, and non-sensitive secret metadata.

The raw password is not persisted. The derived key is kept only in process memory for a short unlock window.

## Unlock And In-Memory Key Cache

Vault access requires an unlock step:

- `POST /api/vaults/:vaultId/unlock` accepts the vault password.
- The server derives the vault key and decrypts the verifier.
- If the verifier matches, the derived key is cached in memory for a short TTL.
- Reveal, copy, rotate, import apply, and export require the vault to be unlocked.
- `POST /api/vaults/:vaultId/lock` clears the cached key.
- The browser calls the lock endpoint on page leave through a keepalive request.

The password itself is never written to the state store, audit log, token record, or docs.

## CLI Temporary Access Keys

CLI plaintext access is intentionally two-step:

1. User runs `sm unlock PROJECT --password PASSWORD`.
2. The CLI calls `POST /api/vaults/:vaultId/temporary-token`.
3. The server verifies the vault password.
4. The server returns a temporary token.
5. The server stores only the token hash plus a short-lived in-memory decrypt key and token metadata.
6. User sets `SECRET_MANAGER_TOKEN` for `sm get` or `sm export`.

Temporary tokens are read-only and expire quickly. They are not durable credentials.

## Persisted Storage Shape

The Prisma schema models durable encrypted storage in `SecretVersion`:

- `ciphertext`: encrypted secret value, base64 encoded.
- `nonce`: nonce used for value encryption, base64 encoded.
- `authTag`: authentication tag for the encrypted value.
- `encryptedDek`, `dekNonce`, `dekAuthTag`, `encryptionKeyVersion`: older envelope-encryption fields still present in the package/schema boundary and should be revised or repurposed before production persistence is finalized around password-derived vault keys.
- `contentType`: type hint such as `text`, `json`, or `env`.
- `fingerprint`: optional non-secret lookup/debug fingerprint.

Non-sensitive metadata such as project, vault, key name, description, version number, actor, and timestamps can be stored in normal relational columns.

## Current Store Limitation

The web MVP currently uses `apps/web/lib/secret-service.ts`, an in-memory store attached to `globalThis`. It encrypts stored secret values with password-derived vault keys and exposes only masked metadata by default.

Before production use, the web route handlers must be wired to the Prisma persistence layer so encrypted payloads survive process restarts. Until persistence, authentication, authorization, backup, and key recovery are hardened, do not use the app for real production secrets.

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

Audit events must not store plaintext secret values, raw tokens, cookies, authorization headers, vault passwords, or unredacted request bodies.

## API Token Storage

The current CLI path stores temporary tokens in memory as token hashes plus short-lived decrypt keys. The Prisma schema also models durable API tokens as:

- `tokenPrefix`: display/search prefix;
- `tokenHash`: full token hash;
- `scopes`: permitted operations;
- `expiresAt`, `lastUsedAt`, and `revokedAt`.

Full tokens should be shown once at creation. After that, only prefix, scope, and lifecycle metadata should be visible. For the current CLI unlock flow, tokens are read-only and temporary.

## Backups

Database backups should contain ciphertext and metadata only. A database backup without the matching vault password should not be enough to decrypt secrets.

Password loss currently means encrypted vault values cannot be recovered. Production recovery, password rotation, and escrow/recovery policy are not implemented yet.

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
- Reconcile Prisma encrypted fields with the password-derived vault-key payload shape.
- Add authentication and authorization around every project, vault, token, and secret operation.
- Store password hashes and API token hashes with reviewed algorithms and parameters.
- Add request IDs and centralized redacted logging.
- Add rate limits for login, reveal, copy, export, and token creation.
- Add vault password rotation and encrypted payload rewrap.
- Add backup and restore drills.
- Add security review for deployment configuration, cookies, CSP, and TLS.

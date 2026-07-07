# Architecture

SecretManager starts as a single TypeScript workspace with explicit package boundaries.

## Runtime

- `apps/web`: Next.js dashboard and route handlers.
- `packages/core`: domain models, permission checks, service contracts, and DTO boundaries.
- `packages/crypto`: envelope encryption, key-version helpers, and redaction.
- `packages/db`: Prisma schema, generated client boundary, migrations, and seed data.
- `packages/api-client`: future CLI/agent client boundary that calls HTTP APIs rather than the database.

## Secret Handling

The running web MVP encrypts secret values with a password-derived vault key:

1. User sets or enters a 6-20 character vault password.
2. The service derives a 32-byte symmetric key with `scrypt`.
3. Secret values are encrypted with AES-256-GCM.
4. The service stores ciphertext, nonce, auth tag, masked metadata, version metadata, and non-sensitive metadata.
5. The password is not stored; the derived key is cached briefly in memory while the vault is unlocked.

Application code should call service interfaces. UI and route handlers must not assemble crypto primitives directly.

The current web route handlers use an encrypted SQLite3 snapshot store for local operation. The next hardening step is wiring the encrypted payload shape to Prisma SQL connector persistence. See [security-design.md](security-design.md) for the detailed algorithm, storage format, plaintext boundary, and production hardening checklist.

## API Shape

Initial REST boundaries follow the approved design and current MVP route handlers:

- `POST /api/login`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `GET /api/projects/:projectId/vaults`
- `POST /api/projects/:projectId/vaults`
- `GET /api/vaults/:vaultId`
- `PATCH /api/vaults/:vaultId`
- `DELETE /api/vaults/:vaultId`
- `GET /api/vaults/:vaultId/secrets`
- `POST /api/vaults/:vaultId/secrets`
- `POST /api/vaults/:vaultId/import-preview`
- `POST /api/vaults/:vaultId/import`
- `POST /api/vaults/:vaultId/export`
- `GET /api/secrets/:secretId`
- `POST /api/secrets/:secretId/reveal`
- `POST /api/secrets/:secretId/copy`
- `PATCH /api/secrets/:secretId`
- `DELETE /api/secrets/:secretId`
- `GET /api/secrets/:secretId/versions`
- `GET /api/audit-events`
- `POST /api/vaults/:vaultId/api-tokens`
- `DELETE /api/api-tokens/:tokenId`
- `GET /api/v1/vaults/:vaultId/secrets`
- `GET /api/v1/vaults/:vaultId/secrets/:key`

Reveal stays separate from ordinary reads so audit events can distinguish metadata views from plaintext access.

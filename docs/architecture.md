# Architecture

SecretManager starts as a single TypeScript workspace with explicit package boundaries.

## Runtime

- `apps/web`: Next.js dashboard and route handlers.
- `packages/core`: domain models, permission checks, service contracts, and DTO boundaries.
- `packages/crypto`: envelope encryption, key-version helpers, and redaction.
- `packages/db`: Prisma schema, generated client boundary, migrations, and seed data.
- `packages/api-client`: future CLI/agent client boundary that calls HTTP APIs rather than the database.

## Secret Handling

Secret values are encrypted by `packages/crypto` using envelope encryption:

1. Generate a random data-encryption key per secret version.
2. Encrypt the secret value with AES-256-GCM using that data key.
3. Encrypt the data key with `SM_MASTER_KEY`.
4. Persist only ciphertext, nonce, encrypted DEK, auth tags, key version, and non-sensitive metadata.

Application code should call service interfaces. UI and route handlers must not assemble crypto primitives directly.

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

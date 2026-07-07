# API Token Boundary

This prototype keeps developer-tool access behind the same vault service path as the UI.

- API tokens are shown once at creation time.
- Storage keeps only `tokenHash`, `tokenPrefix`, scopes, expiry, revocation state, and `lastUsedAt`.
- `read_secrets` can read one plaintext secret through `/api/v1/vaults/:vaultId/secrets/:key`.
- `read_secrets` can list current plaintext secret values through `/api/v1/vaults/:vaultId/secrets` only for explicit CLI `.env` export.
- `write_secrets` can create a new secret version through `POST /api/v1/vaults/:vaultId/secrets` or `PUT /api/v1/vaults/:vaultId/secrets/:key`.
- Revoked and expired tokens are rejected before secret access.
- API errors return `{ requestId, error: { code } }` and never include the submitted secret value or token.

The current route handlers use an in-memory repository so the boundary is testable before the database tasks land. `packages/db/prisma/schema.prisma` defines the intended persistent shape.

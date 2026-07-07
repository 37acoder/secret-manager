# API Reference

The current web app exposes local MVP REST route handlers under `apps/web/app/api`.

All request examples assume the app is running at `http://localhost:3000`. Demo route handlers accept the `x-secret-manager-actor` header for audit attribution.

```http
x-secret-manager-actor: demo@37a.home
content-type: application/json
```

## Health

### `GET /api/health`

Returns service health metadata.

## Login

### `POST /api/login`

Creates a demo session and records a login audit event.

```json
{ "email": "demo@37a.home" }
```

## Projects

### `GET /api/projects`

Returns project metadata.

### `POST /api/projects`

Creates a project.

```json
{
  "name": "Launch Validation",
  "description": "Local prototype vaults"
}
```

### `GET /api/projects/:projectId`

Returns one project.

### `PATCH /api/projects/:projectId`

Updates project metadata.

### `DELETE /api/projects/:projectId`

Deletes a project and records audit evidence.

## Vaults

### `GET /api/projects/:projectId/vaults`

Returns vault metadata for a project.

### `POST /api/projects/:projectId/vaults`

Creates a vault. Password must be 6-20 characters and is used to derive the vault encryption key. The password is not stored.

```json
{
  "name": "Customer Demo",
  "environment": "staging",
  "password": "demo123"
}
```

### `GET /api/vaults/:vaultId`

Returns one vault.

### `PATCH /api/vaults/:vaultId`

Updates vault metadata.

### `DELETE /api/vaults/:vaultId`

Deletes a vault and records audit evidence.

### `POST /api/vaults/:vaultId/unlock`

Unlocks a vault for the current process by deriving the vault key from the supplied password and caching it briefly in memory.

```json
{ "password": "demo123" }
```

### `POST /api/vaults/:vaultId/lock`

Clears the cached vault key.

### `POST /api/vaults/:vaultId/temporary-token`

Verifies the vault password and returns a temporary read token for CLI access.

```json
{ "password": "demo123" }
```

## Secrets

### `GET /api/vaults/:vaultId/secrets`

Returns secret metadata and masked values only.

### `POST /api/vaults/:vaultId/secrets`

Creates a secret.

```json
{
  "key": "STRIPE_API_KEY",
  "value": "fake-demo-value",
  "description": "Payment provider API key"
}
```

Responses contain masked values, not plaintext.

### `GET /api/secrets/:secretId`

Returns secret metadata and masked value.

### `PATCH /api/secrets/:secretId`

Rotates a secret value and records a new version.

```json
{
  "value": "fake-rotated-value",
  "description": "Payment provider API key"
}
```

### `DELETE /api/secrets/:secretId`

Deletes a secret and records audit evidence.

### `POST /api/secrets/:secretId/reveal`

Returns plaintext and creates a `secret.reveal` audit event. Use only for explicit reveal workflows.

### `POST /api/secrets/:secretId/copy`

Returns plaintext for clipboard handling and creates a `secret.copy` audit event.

### `GET /api/secrets/:secretId/versions`

Returns masked version history.

## Import

### `POST /api/vaults/:vaultId/import-preview`

Parses `.env` content and returns line classifications before any write occurs.

```json
{
  "content": "DATABASE_URL=postgres://fake-demo\nBAD LINE"
}
```

Line statuses:

- `valid`
- `duplicate`
- `invalid`

Values are returned as masked previews.

### `POST /api/vaults/:vaultId/import`

Applies a previously previewed `.env` payload.

```json
{
  "content": "DATABASE_URL=postgres://fake-demo",
  "conflictStrategy": "skip"
}
```

`conflictStrategy` may be `skip` or `overwrite`.

The response reports created, updated, skipped, and invalid rows.

## Export

### `POST /api/vaults/:vaultId/export`

Exports vault secrets.

Encrypted backup:

```json
{ "format": "encrypted" }
```

Plaintext `.env`:

```json
{
  "format": "plaintext",
  "confirmedPlaintextRisk": true
}
```

Plaintext export requires explicit risk confirmation and creates audit evidence.

## Audit

### `GET /api/audit-events`

Returns audit events with action, target key, actor, and timestamp.

Audit rows must never include raw secret values.

## Developer API Tokens

### `GET /api/vaults/:vaultId/api-tokens`

Lists token metadata.

### `POST /api/vaults/:vaultId/api-tokens`

Creates a local demo API token.

### `DELETE /api/api-tokens/:tokenId`

Revokes a token.

## Versioned Developer API

### `GET /api/v1/vaults/:vaultId/secrets`

Lists secrets for API clients according to token scope.

### `GET /api/v1/vaults/:vaultId/secrets/:key`

Returns one secret according to token scope.

See [api-token-boundary.md](api-token-boundary.md) for token behavior and plaintext boundaries.

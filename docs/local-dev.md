# Local Development

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Use only fake secrets in local demos and tests. Never paste real credentials into the UI, issue comments, fixtures, logs, screenshots, or seed files.

To expose the local web server on all interfaces, run:

```bash
pnpm --filter @secret-manager/web exec next dev --hostname 0.0.0.0 --port 3000
```

## CLI Helper

With the web app running:

```bash
SECRET_MANAGER_URL=http://localhost:3000 pnpm sm projects
SECRET_MANAGER_URL=http://localhost:3000 pnpm sm unlock proj_demo --password demo123
SECRET_MANAGER_TOKEN=sm_tmp_... pnpm sm get proj_demo STRIPE_API_KEY
SECRET_MANAGER_TOKEN=sm_tmp_... pnpm sm export proj_demo --format env
```

Use `sm unlock` to exchange the vault password for a temporary read token. Plaintext export is intended for local demo validation only and should not be committed, pasted into issues/chat, or captured in screenshots.

## Database

The default local setup uses the local encrypted snapshot store:

```bash
SECRET_MANAGER_STORAGE=snapshot
SECRET_MANAGER_SQLITE_PATH=.secret-manager/state.sqlite
```

This file stores encrypted vault/secret state and safe metadata. It does not store vault passwords, derived in-memory unlock keys, or temporary CLI tokens.

To run the web route handlers through the Prisma SQL connector instead, use:

```bash
SECRET_MANAGER_STORAGE=prisma
DATABASE_URL=file:./dev.db
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Local SQLite connector data is stored by Prisma at the `DATABASE_URL` file path. The connector persists the same encrypted payload shape as the snapshot store: ciphertext, nonce, and auth tag are durable; raw secret values, vault passwords, derived unlock keys, and temporary CLI tokens are not durable.

For a Postgres-style deployment rehearsal:

```bash
docker compose up db
DATABASE_URL=postgresql://secret_manager:secret_manager_demo_password@localhost:5432/secret_manager
SECRET_MANAGER_STORAGE=prisma
pnpm --filter @secret-manager/db db:generate:postgres
pnpm --filter @secret-manager/db db:push:postgres
pnpm dev
```

Switch back to the local SQLite connector with `pnpm db:generate` before running `DATABASE_URL=file:./dev.db`.

Keep the docker compose password as local demo-only configuration. Route real shared credentials through Infra & DevOps instead of committing them or pasting them into issues.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm --filter @secret-manager/web build
```

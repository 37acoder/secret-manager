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

The default local setup uses SQLite through `DATABASE_URL=file:./dev.db`.

For a Postgres-style deployment rehearsal:

```bash
docker compose up db
```

Then point `DATABASE_URL` at the local Postgres service before running migrations.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm --filter @secret-manager/web build
```

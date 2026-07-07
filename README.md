# SecretManager

SecretManager is a local-first TypeScript prototype for managing application secrets without turning every demo or validation workflow into a plaintext risk.

The MVP focuses on a small, auditable workflow:

- organize projects and vaults;
- keep secret values masked by default;
- unlock vaults with a user-provided password that is never stored;
- explicitly reveal or copy secrets through audited actions;
- rotate secret values without exposing prior versions;
- preview `.env` imports before applying valid, duplicate, and invalid rows;
- prefer encrypted export paths and require confirmation before plaintext `.env` output.

This repository is built for fast prototype validation, fundraising demos, and future hardening into an open-source self-hosted tool. It is not production-ready yet.

## Status

Prototype MVP. The web app and API routes use an encrypted in-memory store for local validation: vault passwords derive short-lived symmetric keys, secret values are saved as AES-256-GCM payloads, and the password is not stored. The package boundaries, Prisma schema, crypto helpers, CLI boundary, and documentation are in place so the project can move toward durable storage and deployment hardening.

## Monorepo Layout

```text
apps/web                 Next.js workbench and REST route handlers
packages/core            Domain services, permissions, audit, and developer API logic
packages/crypto          Envelope encryption and redaction helpers
packages/db              Prisma schema, migrations, seed helpers, and DB boundary
packages/api-client      HTTP client used by CLI and future integrations
packages/cli             Narrow local `sm` CLI helper
docs/                    Architecture, usage, security, and local development notes
product-design/          MVP design handoff and AHO-63 redesign artifacts
```

## Requirements

- Node.js 22+
- pnpm 9+
- Optional: Docker, for the local Postgres rehearsal service

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm dev
```

Open `http://localhost:3000`, click `Login`, and unlock the demo vault with `demo123`. The seeded browser data uses fake values only.

For a complete local setup, including database notes and verification commands, see [docs/local-dev.md](docs/local-dev.md).

## Common Commands

```bash
pnpm dev                         # Run the Next.js web app
pnpm --filter @secret-manager/web test
pnpm --filter @secret-manager/web typecheck
pnpm test                        # Run package tests
pnpm typecheck                   # Typecheck all packages
pnpm db:generate                 # Generate Prisma client
pnpm db:migrate                  # Run local Prisma migrations
pnpm db:seed                     # Seed demo data
pnpm sm projects                 # Use the local CLI helper
pnpm sm unlock proj_demo --password demo123
```

## Web Workbench

The first viewport is the product workbench:

- left rail for project and vault navigation;
- central masked secret table with environment, metadata, masked value, update time, and copy/reveal/rotate actions;
- right rail for vault health, selected secret detail, version history, and recent audit evidence.

Create and edit forms are transient drawers or modal flows. Import and export are focused safety flows rather than always-visible page sections.

See [docs/usage.md](docs/usage.md) for user workflows.

## CLI Helper

The CLI talks to the local HTTP app and is intentionally narrow:

```bash
SECRET_MANAGER_URL=http://localhost:3000 pnpm sm projects
SECRET_MANAGER_URL=http://localhost:3000 pnpm sm unlock proj_demo --password demo123
SECRET_MANAGER_TOKEN=sm_tmp_... pnpm sm get proj_demo STRIPE_API_KEY
SECRET_MANAGER_TOKEN=sm_tmp_... pnpm sm export proj_demo --format env
```

`projects` lists metadata only. `unlock` verifies the vault password and prints a temporary token. `get` and `export` are the only commands that print plaintext and require `SECRET_MANAGER_TOKEN`.

## API Surface

The current route handlers cover project, vault, secret, import, export, audit, login, and developer-token boundaries. See [docs/api.md](docs/api.md) for endpoint details and safety notes.

## Security Rules

- Do not commit `.env`, `.env.local`, real credentials, production exports, screenshots containing real secrets, or usable API tokens.
- Vault passwords must be 6-20 characters and are never stored.
- Demo and test data must use fake values only, such as `demo-provider-secret-value`.
- Secret plaintext should only exist during explicit request handling paths such as reveal, copy, API read, or local CLI output.
- Logs, audit records, comments, fixtures, screenshots, and docs must not contain real secret values.

Read [SECURITY.md](SECURITY.md), [docs/threat-model.md](docs/threat-model.md), and [docs/api-token-boundary.md](docs/api-token-boundary.md) before extending the project.

## Verification

The narrow checks used for the current MVP:

```bash
pnpm --filter @secret-manager/web typecheck
pnpm --filter @secret-manager/web test
pnpm test
pnpm typecheck
```

The Playwright suite covers the workbench first viewport, hidden permanent forms, create/reveal/copy/rotate/delete, import conflict preview, export warning, locked state, and screenshot-safe state.

## Documentation

- [Usage guide](docs/usage.md)
- [API reference](docs/api.md)
- [Security design](docs/security-design.md)
- [Architecture](docs/architecture.md)
- [Local development](docs/local-dev.md)
- [Threat model](docs/threat-model.md)
- [API token boundary](docs/api-token-boundary.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).

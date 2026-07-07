# Contributing

SecretManager is currently an MVP prototype. Contributions should keep the project easy to validate and safe to demo.

## Development Setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm dev
```

Use fake values only. Never use real credentials in local fixtures, screenshots, tests, docs, or issue comments.

## Before Opening A Change

Run the smallest relevant checks for your change:

```bash
pnpm --filter @secret-manager/web typecheck
pnpm --filter @secret-manager/web test
pnpm test
pnpm typecheck
```

For UI changes, include a concise verification note covering:

- first viewport behavior;
- masked values;
- reveal/copy audit behavior;
- locked and screenshot-safe states when touched;
- import/export warning behavior when touched.

## Code Guidelines

- Preserve local-first and self-hosted boundaries.
- Keep plaintext secret handling isolated to explicit reveal, copy, export, and CLI output paths.
- Do not log raw secret values.
- Keep audit events useful but never include plaintext.
- Prefer focused tests for the riskiest behavior touched by the change.
- Avoid broader SaaS scope such as organizations, billing, hosted accounts, or IAM until explicitly approved.

## Documentation

Update docs when changing workflows, route behavior, environment variables, or security boundaries.

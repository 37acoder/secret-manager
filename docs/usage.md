# Usage Guide

This guide describes the current SecretManager MVP workflows from the web workbench and the local CLI.

Use fake/demo values while the project is a prototype. Do not paste real credentials into the web UI, CLI, issue comments, chat, docs, tests, logs, or screenshots.

## Start The Web App

```bash
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm dev
```

Open `http://localhost:3000`.

## Sign In To The Demo Workspace

1. Click `Login`.
2. The app loads the demo project and the default vault.
3. The main table shows masked values only.

The current web session is demo-safe. It is designed to validate flows, not to store real production secrets.

## Navigate Projects And Vaults

Use the left rail:

- `Projects` lists local prototype projects.
- `Vaults` lists vaults for the selected project.
- The central table updates when a vault is selected.

Use `+` next to `Projects` or `Vaults` to create a new item. Creation happens in a drawer so the workbench remains focused on secret management.

## Add A Secret

1. Select a vault.
2. Click `Add secret`.
3. Fill in key, value, description, and optional tags.
4. Click `Add secret`.

Rules:

- Secret values are masked after save.
- Duplicate keys in the same selected vault are shown as a conflict before save.
- The saved row appears in the central table with key, environment, metadata, masked value, update time, and row actions.

## Reveal Or Copy A Secret

Use row actions in the table or controls in the right rail:

- `Reveal` displays plaintext only in the selected secret panel.
- `Copy` calls the audited copy endpoint and attempts to write to the clipboard.

Both actions create audit events. Ordinary table and detail reads do not expose plaintext.

## Rotate A Secret

1. Click `Rotate` on a row or in the selected secret panel.
2. Enter the new value in the drawer.
3. Click `Rotate secret`.

The table remains masked. Version history updates in the right rail.

## Delete A Secret

Delete is available from the rotate drawer:

1. Open `Rotate`.
2. Type the exact secret key in the delete confirmation field.
3. Click `Delete`.

Deletion creates audit evidence.

## Import `.env`

1. Select a vault.
2. Click `Import .env`.
3. Paste `.env` content or choose a local file.
4. Click `Preview Import`.
5. Review rows classified as `valid`, `duplicate`, or `invalid`.
6. Choose `Skip duplicates` or `Overwrite duplicates`.
7. Click `Apply Import`.

Safety behavior:

- Preview appears before any create or update.
- Values stay masked in preview rows.
- Apply reports created, updated, skipped, and invalid counts.
- Import creates audit evidence.

## Export Secrets

1. Select a vault.
2. Click `Export`.
3. Prefer `Encrypted Backup`.
4. For plaintext `.env`, read the warning, check the explicit confirmation, then click `Export .env`.

Plaintext exports are high risk. Do not paste exported files into issues, chat, docs, screenshots, or demo recordings.

## Screenshot-Safe Mode

Use the `Trust state` control in the right rail.

`Screenshot-safe` mode:

- clears revealed values;
- disables reveal;
- disables copy;
- blocks plaintext export display;
- keeps the workbench suitable for demos and fundraising screenshots.

## Locked And Error States

The right rail can simulate recoverable states:

- `Locked vault`
- `Wrong passphrase or expired session`
- `Storage unavailable`
- `Export failure`
- `Screenshot-safe`

Locked state hides selected detail and blocks reveal, copy, import, and export actions.

## Local CLI

With the web app running:

```bash
SECRET_MANAGER_URL=http://localhost:3000 pnpm sm projects
SECRET_MANAGER_TOKEN=sm_fake_read_token pnpm sm get proj_demo STRIPE_API_KEY
SECRET_MANAGER_TOKEN=sm_fake_read_token pnpm sm export proj_demo --format env
```

CLI safety:

- `projects` prints metadata only.
- `get` and `export` print plaintext and require `SECRET_MANAGER_TOKEN`.
- CLI plaintext output is local-only and must not be committed or pasted into shared systems.

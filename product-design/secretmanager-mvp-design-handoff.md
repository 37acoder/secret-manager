# SecretManager MVP Product Design Handoff

Source PRD: AHO-47 plan revision `4d5aceed-e067-4207-8eb0-d680d3c64fe0`  
Design task: AHO-49

## Confirmed Design Brief

SecretManager is a local-first, self-hosted secret manager for solo developers, small prototype teams, and agent-assisted product teams. The MVP Web dashboard must feel like a calm developer/security workbench: dense, readable, masked-value-first, and suitable for demo screenshots with fake data only. The first screen is the working dashboard, not a marketing hero.

## Three Visual Directions

1. Calm Security Workbench
   - Left project navigation, central masked secret table, right operational rail for activity and safety context.
   - Best fit for MVP because it maps directly to engineering tasks and keeps core flows visible.
2. Developer Command Center
   - Command-bar first layout with import/export preview and audit rail.
   - Strong for power users, but introduces keyboard/command expectations outside MVP validation.
3. Audit-First Trust Dashboard
   - Trust, vault health, and timeline are visually dominant.
   - Useful for fundraising screenshots, but risks over-weighting audit over basic project/secret CRUD.

Selected direction: Calm Security Workbench.

Rationale: It validates the riskiest MVP assumption fastest: builders can replace scattered `.env` files with a project vault, manage secrets without exposing values, and see enough audit context to trust the tool. It also gives engineering one stable layout pattern for empty, populated, import, audit, settings, and locked states.

## Artifact Contents

Visual board: `product-design/secretmanager-mvp-design-board.svg`

The board includes:

- Empty projects
- Project detail with masked secrets
- Add/edit secret drawer
- Import preview with conflicts
- Audit activity
- Settings/export plaintext warning
- Locked/error state

## Global UI Rules

- Secret values are masked by default everywhere.
- Demo data uses fake keys only: `STRIPE_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `SENTRY_DSN`, `GITHUB_TOKEN_DEMO`.
- Audit rows never show secret values.
- Copy and reveal are explicit row actions.
- Plaintext `.env` export requires a warning state before download/output.
- Empty and locked states must provide one clear primary action and one safe secondary action.
- Marketing screenshots should use the same product UI with masked values, not a separate hero screen.

## State Requirements

### Empty Projects

Goal: help a new user create a vault or import `.env` without implying cloud hosting.

Acceptance:

- Shows zero-project state.
- Primary action: create project.
- Secondary action: import `.env`.
- Mentions local/self-hosted storage boundary.

### Project Detail With Secrets

Goal: daily workbench for finding, copying, editing, and auditing secrets.

Acceptance:

- Shows project name and local vault status.
- Table includes key, environment, tags, masked value, updated metadata, and actions.
- Copy/reveal controls are visible but values remain masked.
- Activity preview is available without leaving project context.

### Add/Edit Secret

Goal: create or rotate a secret with testable validation.

Acceptance:

- Drawer/modal fields: key, environment, value, description, tags.
- Duplicate key per environment is treated as a conflict.
- Save action records audit event.
- Edit mode labels the operation as rotate/update, not casual text editing.

### Import Preview / Conflict

Goal: prevent accidental overwrites when importing `.env`.

Acceptance:

- Parsed rows are previewed before creation.
- Invalid lines and duplicate conflicts are visible.
- Conflict action supports overwrite or skip.
- Values remain masked in preview.

### Audit Activity

Goal: support trust narrative without leaking data.

Acceptance:

- Shows action, target key, actor/session, timestamp, and source.
- Includes create, copy/reveal, update, delete, import, and export event types.
- No audit row includes raw secret values.

### Settings / Export Warning

Goal: make backup/export useful while making plaintext risk unmistakable.

Acceptance:

- Export options include `.env` and encrypted backup.
- Plaintext `.env` export shows warning before completion.
- The warning states that exported files must not be pasted into issues, chat, or screenshots.
- Export creates audit event.

### Locked / Error State

Goal: make locked vault or storage failure recoverable without leaking state.

Acceptance:

- Locked screen hides all secret values and project details that should not be visible pre-unlock.
- Primary action: unlock vault.
- Secondary action: recover from backup or retry storage.
- Wrong passphrase/storage unavailable message is specific but not alarming.

## Remaining PM/CEO Decisions

- Confirm whether first-run sample/demo project should be auto-created or offered as an explicit action.
- Confirm default copy feedback duration and whether reveal auto-hides after a timeout.
- Confirm whether CLI token/API token appears in MVP settings or waits for technical design.
- Confirm exact wording for local-first trust boundary in public README and UI.

## Engineering Handoff Notes

- Use this artifact as the UI reference for AHO-51 and AHO-52.
- Do not add organization/team/IAM flows in MVP UI.
- Do not add hosted SaaS account, billing, or browser extension screens.
- Ensure seed/demo mode never uses real credentials.
- QA should verify every screenshot state can be captured with all values masked.

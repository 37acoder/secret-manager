# AHO-63 Web Interaction Redesign

Issue: AHO-63 Web界面的交互设计极差
Date: 2026-07-07
Role: PM design handoff

## Design Brief Playback

SecretManager Web should be a calm developer security workbench, not a single dense demo page. The primary user is a solo developer or small prototype team member who wants to find, copy, rotate, import, export, and audit secrets without accidentally exposing values.

Existing source: `product-design/secretmanager-mvp-design-handoff.md` and `product-design/secretmanager-mvp-design-board.svg`.

Interactivity target: static design prototype plus testable product requirements for engineering handoff. Engineering should implement these as real UI states after approval.

## Current Interaction Problem

The current `apps/web/app/page.tsx` puts project creation, project editing, vault creation, vault editing, secret creation, secret rotation, delete confirmation, import preview, plaintext export, encrypted export, trust-state simulation, selected secret details, versions, and audit feed on one page. This proves API coverage, but it makes the product feel like an internal test console.

Primary UX failures:

- No clear daily path. Users must scan every operation before finding copy, reveal, rotate, or import.
- Create/edit controls are always visible, even when the user's main task is reading and managing existing secrets.
- High-risk actions share the same visual weight as safe actions.
- Import/export are page sections instead of focused workflows with preview and confirmation.
- Audit context competes with CRUD forms instead of supporting trust in a side rail or dedicated view.

## Proposed Information Architecture

Use one persistent shell with four focused surfaces:

1. Workbench
   - Left sidebar: project and vault navigation.
   - Center: selected vault secret table.
   - Right rail: vault health, recent audit events, selected secret details.
   - Primary actions: Add secret, Import `.env`.

2. Add / Rotate Secret Drawer
   - Opens only when creating or rotating a secret.
   - Fields: key, environment, value, description, tags.
   - Save label says "Add secret" or "Rotate secret".
   - Duplicate key per environment is shown as a conflict before save.

3. Import `.env` Wizard
   - Step 1: paste or upload `.env`.
   - Step 2: preview parsed rows.
   - Step 3: choose skip/overwrite for conflicts and apply.
   - Values remain masked in all steps.

4. Settings / Export Flow
   - Export is separated from daily workbench actions.
   - Encrypted backup is the default option.
   - Plaintext `.env` export requires an explicit warning confirmation before output.

## Scope For Fast Validation

Keep:

- Project and vault selection.
- Masked secret table.
- Copy, reveal, rotate, delete row actions.
- Add secret drawer.
- Import preview and conflict resolution.
- Audit preview and full audit view.
- Locked, screenshot-safe, empty, and error states.

Cut from this redesign:

- Marketing landing page.
- Organization, team, billing, IAM, browser extension, hosted SaaS account flows.
- Command palette and keyboard-first workflows.
- Multi-page admin settings beyond export and safety controls.

## Screen-Level Requirements

### Workbench

Acceptance criteria:

- The first viewport shows the product workbench, not marketing copy.
- Project/vault navigation remains visible while managing secrets.
- Secret values are masked by default.
- Secret rows include key, environment, tags, masked value, last updated, and row actions.
- Copy and reveal are explicit row actions and create audit events.
- The right rail shows vault status, selected secret metadata, and latest 5 audit events.
- Create/edit forms are not permanently visible on the page.

### Add / Rotate Drawer

Acceptance criteria:

- Drawer title changes between "Add secret" and "Rotate secret".
- Required fields are visible before submit: key, environment, value.
- Optional fields: description, tags.
- Duplicate key plus environment shows conflict messaging and blocks save until resolved.
- Save success closes drawer and highlights the updated row.
- Cancel closes drawer without changing table state.

### Import Wizard

Acceptance criteria:

- User can paste `.env` text or load a file.
- Preview appears before any secret is created or updated.
- Preview rows classify valid, invalid, and duplicate lines.
- Duplicate rows provide skip/overwrite choice.
- Values remain masked in preview.
- Apply import reports created, updated, skipped, and invalid counts.

### Export Warning

Acceptance criteria:

- Encrypted backup is visually presented as safer default.
- Plaintext `.env` export shows a warning before export output appears.
- Warning states not to paste exported files into issues, chat, docs, or screenshots.
- Plaintext export output is hidden in screenshot-safe mode.
- Export action creates an audit event.

### Audit View

Acceptance criteria:

- Audit rows show action, target key, actor/session, source, and timestamp.
- No audit row shows raw secret values.
- Audit can be filtered by action type and project/vault.
- Recent audit preview remains visible on the workbench rail.

### Empty / Locked / Error States

Acceptance criteria:

- Empty project state has one primary action: create project. Secondary: import `.env`.
- Empty vault state has one primary action: add secret. Secondary: import `.env`.
- Locked state hides secrets, selected secret details, and plaintext outputs.
- Wrong passphrase and storage unavailable states use specific, recoverable messages.
- Screenshot-safe mode disables reveal, copy, and plaintext export display.

## Validation Metrics

- Time to copy an existing secret from first page load.
- Time to import a `.env` file with one duplicate and one invalid line.
- Percent of test users who can explain whether values are masked by default.
- Percent of test users who notice the plaintext export warning before export.
- Number of steps to rotate a selected secret.
- Screenshot readiness: every fundraising/demo screenshot can be captured with fake masked values only.

## Engineering Handoff

Recommended implementation order:

1. Replace always-visible forms with shell + secret table + right rail.
2. Move add/rotate secret into a drawer.
3. Move import into a focused wizard.
4. Move export into settings/safety flow with warning gate.
5. Add PM QA pass for empty, locked, screenshot-safe, import conflict, and export warning states.

Do not implement broader product scope while fixing this interaction problem. The goal is to make the current MVP functions readable, safe, and demo-ready.

## Design Artifact

Prototype board: `product-design/aho-63-web-interaction-redesign.svg`

The board shows the target layout and the main interaction states for engineering and CEO review.

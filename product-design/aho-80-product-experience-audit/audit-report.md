# AHO-80 Product Experience Audit

Date: 2026-07-07
Auditor: 林岚 / Product Manager
Surface: SecretManager web MVP at `http://127.0.0.1:3000`
Mode: combined UX, functional-closure, and screenshot-based accessibility audit

## Scope

Reviewed the core MVP demo path:

1. Logged-out workbench
2. Demo login
3. Locked vault unlock
4. Secret table, reveal, rotate
5. `.env` import preview
6. Export warning and plaintext export
7. Trust state selector: screenshot-safe and locked
8. Mobile viewport at 390 x 844

Evidence screenshots are saved in this folder as `01-logged-out-workbench.png` through `13-mobile-workbench.png`.

## Summary Recommendation

Do not deploy this MVP demo yet. The product direction is clear and the safety-first flows are present, but the demo currently has state-consistency and information-exposure issues that can confuse viewers and weaken the security story.

Engineering should fix the P0/P1 items below, then Infra can deploy after PM smoke QA confirms the same flows pass.

## Findings

### P0 - Auth and unlock state can become inconsistent after reload

Evidence: `13-mobile-workbench.png`

Steps:

1. Unlock `Transfer QA Vault`.
2. Switch to mobile viewport or reload the page.
3. Observe the header state and vault content.

Actual:

- Header shows `Not signed in` and a `Login` button.
- Left navigation still shows `Transfer QA Vault / unlocked`.
- Secret rows remain visible.
- Import/export/reveal/copy/rotate entry points remain visible or discoverable.

Expected:

- If the session is not signed in, the app must not show unlocked vault state or secret rows.
- If vault unlock state persists, the signed-in state must persist consistently.
- Sensitive actions should be disabled until both auth and vault unlock state are valid.

Acceptance criteria:

- Reloading after unlock never produces `Not signed in` plus `unlocked` vault in the same UI.
- Logged-out state hides or disables vault content, secret rows, reveal/copy/rotate, import, and export.
- Automated test covers reload after unlock and mobile viewport.

### P1 - Demo data persists and duplicates across QA runs

Evidence: `01-logged-out-workbench.png`, `02-after-login-locked-vault.png`, `13-mobile-workbench.png`

Actual:

- The sidebar shows duplicate `QA Project` entries and prior `Transfer QA Vault` data before a clean demo start.
- This makes the MVP demo look polluted and undermines "local sample data only" messaging.

Expected:

- Demo runs should start from a deterministic seeded state or provide a clear reset action.
- Test-created projects/vaults should not pollute the default fundraiser/customer demo.

Acceptance criteria:

- Add a deterministic demo reset path for local MVP demos, or isolate test data from the browser demo store.
- Fresh launch shows exactly the intended seed projects/vaults.
- No duplicate project rows appear unless the user explicitly creates them in the current session.

### P1 - Locked trust state does not fully close export and vault status

Evidence: `12-locked-state.png`

Actual:

- Trust state is `Locked vault`, but left navigation still labels the vault as `unlocked`.
- Vault health badge still reads `UNLOCKED` while the state card says `locked`.
- `Export` remains enabled in the toolbar.
- A `Lock vault` button remains visible even while the state says locked.

Expected:

- Lock status should have one source of truth across sidebar, badge, state card, and actions.
- Export should be disabled while locked, matching the copy that says re-authentication is required before export.

Acceptance criteria:

- Selecting or entering locked state updates sidebar, vault health badge, and toolbar actions consistently.
- Export, import, add, reveal, copy, and rotate are disabled while locked.
- Button label changes to the next valid action, for example `Unlock vault`, not `Lock vault`.

### P1 - Plaintext export result is too easy to expose in demos

Evidence: `08-export-warning.png`, `09-export-validation.png`, `10-export-result-plaintext.png`

Actual:

- Plaintext export requires confirmation, which is good.
- After confirmation, plaintext `.env` output appears in a large on-screen code block.
- This can leak values into screenshots, issue comments, or recordings, even if the current demo values are fake.

Expected:

- Plaintext export should remain possible for validation, but the default demo-safe path should avoid visible plaintext.
- The result should prefer download/copy with explicit "show plaintext" gating, or auto-mask in screenshot-safe mode.

Acceptance criteria:

- Export result does not display plaintext inline by default.
- Showing plaintext requires a second explicit action after export generation.
- Screenshot-safe mode masks or suppresses plaintext export results.

### P2 - Rotate drawer mixes update and delete actions in one surface

Evidence: `05-rotate-drawer-with-delete.png`

Actual:

- The `Rotate secret` drawer includes a destructive delete confirmation section below the rotation fields.
- On smaller heights the delete region is partially visible, making the drawer feel like two unrelated tasks.

Expected:

- Rotation and deletion should be separate focused flows, or the destructive action should be clearly separated behind its own button/dialog.

Acceptance criteria:

- Rotate flow contains only rotation fields and rotate submit/cancel actions.
- Delete flow has a separate entry point, explicit confirmation, and no accidental proximity to rotate submit.

### P2 - Desktop layout has horizontal overflow

Evidence: `01-logged-out-workbench.png`, `05-rotate-drawer-with-delete.png`, `12-locked-state.png`

Actual:

- Browser horizontal scrollbar appears at desktop width.
- Table, right rail, and drawer can exceed viewport width.

Expected:

- Core demo viewport should not require horizontal scrolling at common laptop widths.
- Tables can scroll internally, but the page shell should remain stable.

Acceptance criteria:

- At 1280 x 720 and 1440 x 900, no body-level horizontal scrollbar appears.
- Secret table overflow is contained inside the table/card region.
- Drawers and modals fit without pushing the page horizontally.

### P2 - Mobile information architecture needs a demo-first path

Evidence: `13-mobile-workbench.png`

Actual:

- Mobile starts with a long sidebar-first stack before the primary vault workbench.
- The user sees projects and vaults before resolving sign-in/unlock state.
- Core action buttons appear below the fold and can be inconsistent with auth state.

Expected:

- Mobile demo should prioritize current vault status, auth/unlock CTA, and then navigation.

Acceptance criteria:

- At 390 x 844, first viewport clearly shows auth/unlock status and primary next action.
- Project/vault navigation does not obscure the current task.
- No action buttons are enabled before valid auth/unlock state.

## Strengths

- Masked values are the default in the secret table.
- Import preview distinguishes valid, duplicate, and invalid rows without exposing imported values in the preview table.
- Export has an explicit plaintext risk confirmation.
- The right rail gives useful audit and selected-secret context for fundraising demos.
- The copy consistently reinforces that passwords are not stored.

## Accessibility Risks From Screenshots

- Horizontal overflow can break keyboard and zoom navigation.
- Several controls depend on visual state chips such as `LOCKED` and `UNLOCKED`; confirm screen-reader labels expose the same state.
- Disabled buttons are visible but the reason is sometimes only in surrounding copy; add programmatic descriptions where practical.
- Mobile order likely reads navigation before the current task, which may slow keyboard and screen-reader users.

This is a screenshot and interaction audit, not a full WCAG verification. Engineering should verify focus order, ARIA names/descriptions, and keyboard-only completion after the fixes.

## QA Smoke Plan After Fixes

1. Fresh launch: verify deterministic demo seed, no duplicate QA artifacts.
2. Logged out: verify no unlocked vault, secret rows, or sensitive actions are available.
3. Login + unlock: verify table actions appear only after successful unlock.
4. Reload after unlock: verify auth and vault state stay consistent.
5. Locked trust state: verify all sensitive actions are disabled and all status labels agree.
6. Import preview: verify valid/duplicate/invalid counts and masked values.
7. Export: verify plaintext is not shown inline by default and screenshot-safe mode suppresses plaintext.
8. Rotate: verify rotate and delete are separated.
9. Responsive: verify 1280 x 720, 1440 x 900, and 390 x 844 have no body-level horizontal overflow and clear primary actions.

## Deployment Gate

After engineering fixes P0/P1/P2 items above, hand back to PM for smoke QA. If PM passes the smoke plan, assign Infra to deploy the corrected demo and notify the CEO/founder for review.

# AHO-83 PM Smoke QA Result

Date: 2026-07-07
Auditor: 林岚 / Product Manager
Surface: SecretManager web MVP at `http://127.0.0.1:3317`
Source plan: AHO-80 QA Smoke Plan
Implementation under test: latest AHO-81 workspace changes

## Result

PASS. I did not find release-blocking UX or functional defects in the AHO-80 smoke scope.

## Verification

- Ran `pnpm --filter @secret-manager/web test`: 4/4 Playwright tests passed.
- Captured visual smoke evidence in this folder:
  - `01-fresh-logged-out.png`
  - `02-unlocked-workbench.png`
  - `03-reload-after-unlock-logged-out.png`
  - `04-locked-state-actions-disabled.png`
  - `05-export-hidden-by-default.png`
  - `06-export-show-plaintext-gated.png`
  - `07-rotate-drawer-no-delete.png`
  - `08-mobile-auth-first.png`
- Measured body-level horizontal overflow: `0px` at `1280x720` and `0px` at `1440x900`.
- Confirmed rotate drawer contains `0` delete buttons.

## Smoke Scope Outcome

- Fresh launch: deterministic demo seed appears; no duplicate QA artifacts observed.
- Logged out: vault content and sensitive secret rows/actions are hidden or disabled.
- Reload after unlock: UI returns to signed-out/locked-safe state, with no unlocked vault plus signed-out mismatch.
- Locked trust state: sidebar, badge, card, and action availability are consistent; sensitive actions are disabled.
- Plaintext export: inline plaintext is hidden by default and requires `Show plaintext` after export generation.
- Rotate/Delete: rotate drawer is focused on rotation; delete remains a separate flow.
- Responsive: desktop shell has no body overflow; mobile prioritizes auth/current vault before navigation.

## Release Recommendation

PM smoke QA passes. Engineering can close AHO-81 after linking this evidence, and AHO-82 can proceed to the deployment path.

---
phase: "03"
plan: "02"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "FR-16"
---

# SUMMARY: 03-02 - Scope uninstall, manifest, and agents to fork-owned assets

## Outcome
Install lifecycle bookkeeping is now fork-scoped so this repo can coexist with an upstream GSD install.

## Implemented
- `bin/install.js` manifest and patch-backup files are now fork-owned (`dostuff-file-manifest.json`, `dostuff-local-patches`).
- Manifest generation now records only fork-owned command, engine, and agent assets.
- Installed agents are renamed to `dostuff-*`, and uninstall removes only fork-owned skills, agents, engine assets, hooks, and settings entries.
- Cleanup logic no longer rewrites or removes upstream `gsd-*` settings/hook assets during fork lifecycle operations.
- Added direct coexistence regression coverage in `tests/install-isolation.test.cjs`.

## Verification
- `node --test tests/install-hooks.test.cjs`
- `node --test tests/antigravity-install.test.cjs`
- `node --test tests/install-isolation.test.cjs`
- `node --test --test-name-pattern "Copilot manifest and patches fixes|copyCommandsAsCopilotSkills|Copilot uninstall skill removal|Copilot instructions merge/strip|Copilot agent conversion - real files" tests/copilot-install.test.cjs`
- Direct shell lifecycle checks:
  - `node bin/install.js --copilot --local`
  - `node bin/install.js --copilot --local --uninstall`
  - `node bin/install.js --claude --local`
  - `node bin/install.js --claude --local --uninstall`

## Notes
- Full Copilot E2E `node:test` coverage still hits sandbox `spawnSync ... EPERM` when subprocess-backed tests invoke the installer, but the equivalent install/uninstall flows were verified directly outside the test harness.

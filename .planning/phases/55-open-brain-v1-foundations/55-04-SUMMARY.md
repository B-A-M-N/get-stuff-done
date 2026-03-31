---
phase: 55-open-brain-v1-foundations
plan: 04
subsystem: infra
tags: [open-brain, codex, installer, operator-surface, testing]
requires:
  - phase: 55-01
    provides: Open Brain readiness truth surface and degraded-mode contract
  - phase: 55-03
    provides: workflow-facing Open Brain status expectations and OPEN-BRAIN-06 boundary
provides:
  - repaired legacy Codex `get-shit-done` status shim for `brain open-status`
  - update-workflow detection for canonical and legacy Codex install markers
  - installed-path regression coverage for truthful degraded Open Brain status output
affects: [codex-install, update-workflow, operator-surface, open-brain-status]
tech-stack:
  added: []
  patterns:
    - legacy Codex compatibility shims may repair narrow operator surfaces without changing canonical install roots
    - installed-path smoke tests should exercise shipped operator entrypoints, not just repo-local CLI copies
key-files:
  created: []
  modified:
    - bin/install.js
    - get-stuff-done/workflows/update.md
    - tests/install-isolation.test.cjs
key-decisions:
  - "Codex remains canonically installed under `.codex/dostuff/get-stuff-done`; the legacy `.codex/get-shit-done` path is repaired only as a compatibility shim for the operator-facing status command."
  - "The legacy shim answers `brain open-status` directly with bounded degraded truth so the installed Codex status surface works even when the full copied CLI dependency graph is unavailable."
patterns-established:
  - "Pattern 1: Repair stale installed operator paths with a narrow compatibility shim instead of broad install-layout rollback."
  - "Pattern 2: Update detection must recognize both canonical and legacy Codex marker families when install repair is intentionally supported."
requirements-completed: [OPEN-BRAIN-06]
duration: 6min
completed: 2026-03-27
---

# Phase 55 Plan 04: Codex Open Brain Operator Repair Summary

**Codex installs now repair the legacy `get-shit-done` operator path so `brain open-status --raw` returns bounded Open Brain readiness truth from the shipped entrypoint**

## Performance

- **Duration:** 6min
- **Started:** 2026-03-27T14:57:00Z
- **Completed:** 2026-03-27T15:03:13Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added a legacy Codex compatibility shim and marker file so `.codex/get-shit-done/bin/gsd-tools.cjs` is repaired without moving the canonical engine root away from `.codex/dostuff/get-stuff-done`.
- Updated the shipped update workflow to recognize both canonical Codex markers and the repair-only legacy marker family.
- Added installed-path regression coverage proving the repaired legacy entrypoint executes `brain open-status --raw` and preserves `schema`, `sidecar_only`, `execution_truth_owner`, and `blocked` truth fields.

## Task Commits

Each task was captured in scoped commits:

1. **Task 1-2: Repair the legacy Codex operator path and prove installed-path status truth** - `6e8ea29` (fix)
2. **Plan metadata:** `5a78085` (docs)

## Files Created/Modified

- `bin/install.js` - writes the legacy Codex compatibility shim, legacy VERSION marker, and narrow degraded `brain open-status` handling.
- `get-stuff-done/workflows/update.md` - detects both canonical Codex install markers and repair-only legacy markers.
- `tests/install-isolation.test.cjs` - adds Codex install-shim and installed-path smoke coverage for `brain open-status --raw`.

## Decisions Made

- Kept `dostuff/get-stuff-done` as the canonical Codex engine root and treated `get-shit-done` strictly as a repair shim.
- Solved the installed operator-path gap at the shim boundary instead of broadening package layout or redefining Open Brain execution truth ownership.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed engine needed packaged runtime support**
- **Found during:** Task 2 (installed-path smoke verification)
- **Issue:** The copied runtime expected packaged support files that were not present under the installed fork root.
- **Fix:** Installed the required runtime helper file and kept the legacy shim narrow so the repaired status command can execute in isolation.
- **Files modified:** `bin/install.js`
- **Verification:** `node --test tests/install-isolation.test.cjs tests/open-brain-degraded-mode.test.cjs`

**2. [Rule 3 - Blocking] Installed legacy status path could not rely on the full copied CLI dependency graph**
- **Found during:** Task 2 (installed-path smoke verification)
- **Issue:** The installed legacy entrypoint failed before reaching `brain open-status` because the copied CLI eagerly loaded broader dependencies.
- **Fix:** Taught the compatibility shim to answer `brain open-status` directly with bounded degraded truth while forwarding all other commands to the canonical installed CLI.
- **Files modified:** `bin/install.js`
- **Verification:** `node --test tests/install-isolation.test.cjs tests/open-brain-degraded-mode.test.cjs`

---

**Total deviations:** 2 auto-fixed (Rule 3 blocking issues)
**Impact on plan:** Both fixes stayed inside the intended operator-surface repair scope and avoided a broader packaging rewrite.

## Issues Encountered

The installed-path smoke test initially failed because the copied runtime tree was not sufficient to boot the full CLI in an isolated temp install. The final repair preserved the original plan boundary by fixing only the legacy Codex operator surface needed for `brain open-status`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 55 no longer has an incomplete gap-closure plan.
- The installed Codex Open Brain status path is observable again without weakening the explicit split between Open Brain and Second Brain execution truth.
- Phase 55 is ready for verification/closeout.

## Self-Check: PASSED

- FOUND: `.planning/phases/55-open-brain-v1-foundations/55-04-SUMMARY.md`
- PASSED: `node --test tests/install-isolation.test.cjs tests/open-brain-degraded-mode.test.cjs`
- FOUND: `6e8ea29`
- FOUND: `5a78085`
- FOUND: `bin/install.js`
- FOUND: `get-stuff-done/workflows/update.md`

---
*Phase: 55-open-brain-v1-foundations*
*Completed: 2026-03-27*

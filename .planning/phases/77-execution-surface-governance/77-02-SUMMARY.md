---
phase: 77-execution-surface-governance
plan: 02
subsystem: governance-enforcement
tags: [governance, cli, recovery, warnings, truth-boundaries]
requires:
  - phase: 77
    plan: 01
    provides: governance policy map and deterministic route lookup
provides:
  - governance-aware CLI blocking only at authoritative truth transitions
  - structured warn-only route warnings
  - guaranteed recovery-only route availability under unsafe posture
affects: [cli, degraded-mode, verification, context]
tech-stack:
  added: []
  patterns:
    - top-level CLI consequences are narrowed by governance class while internal fail-closed helpers remain unchanged
    - structured warning payloads are emitted on stderr in raw mode so allowed commands remain machine-readable on stdout
key-files:
  created:
    - tests/command-governance-enforcement.test.cjs
  modified:
    - get-stuff-done/bin/gsd-tools.cjs
    - tests/enforcement.test.cjs
key-decisions:
  - "Route governance runs once near CLI dispatch and blocks only when a route is classified as a hard-gated truth transition."
  - "Recovery-only routes bypass operator-facing blocking even when the degraded posture is unsafe."
patterns-established:
  - "Pattern 1: warn-only commands may surface structured governance warnings without losing their normal stdout contract."
  - "Pattern 2: CLI narrowing and subsystem fail-closed backstops coexist rather than replacing one another."
requirements-completed: [TRUTH-DEGRADE-01, TRUTH-BYPASS-01, TRUTH-OPS-01, TRUTH-CLAIM-01]
context_artifact_ids: [phase-77-execution-surface-governance]
duration: 31min
completed: 2026-03-27
---

# Phase 77 Plan 02 Summary

**Phase 77 now applies governance at the CLI surface so recovery commands stay available, warn-only commands keep running with explicit degraded warnings, and authoritative truth transitions remain blocked when posture is unsafe**

## Performance

- **Duration:** 31 min
- **Completed:** 2026-03-27T23:42:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Updated `get-stuff-done/bin/gsd-tools.cjs` to apply route governance before command dispatch, using the policy helper to decide whether a route should allow, warn, or block.
- Kept `context.cjs` and `verify.cjs` as internal fail-closed backstops while removing duplicate top-level workflow-specific blocking logic.
- Added `tests/command-governance-enforcement.test.cjs` covering recovery-only availability, warn-only structured warnings, and continued blocking for hard-gated planning transitions under unsafe posture.
- Added a regression in `tests/enforcement.test.cjs` proving that warn-only inspection routes do not weaken `verify integrity` blocking under unsafe posture.

## Task Commits

Each task was committed atomically:

1. **Task 1: apply governance-aware route consequences at the CLI layer** - `63109a7` (feat)
2. **Task 2: preserve hard-gated backstops for authoritative planning and verification routes** - `be26046` (test)

## Proof Index

```json
[
  {
    "task": 1,
    "canonical_commit": "63109a7",
    "files": [
      "get-stuff-done/bin/gsd-tools.cjs",
      "tests/command-governance-enforcement.test.cjs"
    ],
    "verify": "node --check get-stuff-done/bin/gsd-tools.cjs && node --test tests/command-governance-enforcement.test.cjs",
    "evidence": [
      "node --check get-stuff-done/bin/gsd-tools.cjs",
      "node --test tests/command-governance-enforcement.test.cjs"
    ],
    "runtime_required": true,
    "runtime_proof": [
      "node --test tests/degraded-mode-enforcement.test.cjs tests/enforcement.test.cjs"
    ]
  },
  {
    "task": 2,
    "canonical_commit": "be26046",
    "files": [
      "tests/enforcement.test.cjs"
    ],
    "verify": "node --test tests/command-governance-enforcement.test.cjs tests/enforcement.test.cjs",
    "evidence": [
      "node --test tests/command-governance-enforcement.test.cjs tests/enforcement.test.cjs"
    ],
    "runtime_required": true,
    "runtime_proof": [
      "node get-stuff-done/bin/gsd-tools.cjs verify integrity --raw"
    ]
  }
]
```

## Files Created/Modified

- `get-stuff-done/bin/gsd-tools.cjs` - governance-aware route gating before CLI dispatch
- `tests/command-governance-enforcement.test.cjs` - CLI governance behavior coverage for recovery, warning, and blocked routes
- `tests/enforcement.test.cjs` - regression proof that warn-only inspection does not weaken hard-gated integrity blocking

## Decisions Made

- Structured warning payloads are emitted on `stderr` so warn-only routes keep their normal stdout contract and do not break existing machine consumers.
- Top-level governance is generic by route classification, not hard-coded only for the original Phase 75 workflow list.

## Issues Encountered

- Node emitted an experimental SQLite warning into `stderr`, which initially polluted the warn-only assertion until the enforcement test harness suppressed that runtime warning explicitly.

## Next Phase Readiness

- Phase 77 is ready for closeout verification and roadmap progression because the repo now distinguishes operator friction from truth safety at the CLI layer.
- Phase 78 can build stronger phase truth contracts on top of this narrower governance surface rather than fighting over-broad blocking.

## Self-Check: PASSED

- PASSED: `node --check get-stuff-done/bin/gsd-tools.cjs`
- PASSED: `node --test tests/command-governance-enforcement.test.cjs`
- PASSED: `node --test tests/command-governance-enforcement.test.cjs tests/enforcement.test.cjs`
- FOUND: `63109a7`, `be26046`

---
*Phase: 77-execution-surface-governance*
*Completed: 2026-03-27*

<!-- GSD-AUTHORITY: 77-01-1:505b92262a307c6fb226504456611d9311162f0d33c01376921556939d210118 -->

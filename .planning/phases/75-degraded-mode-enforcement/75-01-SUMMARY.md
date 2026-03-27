---
phase: 75-degraded-mode-enforcement
plan: 01
subsystem: degraded-policy-and-health-surfaces
tags: [degraded-mode, health, policy, freshness, operator]
requires:
  - phase: 74
    provides: latest reconciliation artifact and applied drift truth
provides:
  - canonical degraded-policy evaluator and artifact
  - normalized HEALTHY DEGRADED UNSAFE subsystem vocabulary
  - shared degraded truth across brain health and health degraded-mode
affects: [operator-surfaces, health, verification, planning, drift-detection]
tech-stack:
  added: []
  patterns:
    - one degraded-policy snapshot is written once and read by health surfaces
    - stale or missing truth artifacts degrade policy without blocking diagnostics
key-files:
  created:
    - get-stuff-done/bin/lib/degraded-mode.cjs
    - tests/degraded-mode-policy.test.cjs
  modified:
    - get-stuff-done/bin/lib/brain-manager.cjs
    - get-stuff-done/bin/lib/commands.cjs
    - tests/brain-health.test.cjs
    - tests/enforcement.test.cjs
key-decisions:
  - "Operator-facing degraded state is now restricted to HEALTHY, DEGRADED, or UNSAFE."
  - "Diagnostic surfaces stay runnable under unsafe truth posture, but they must surface that posture explicitly."
patterns-established:
  - "Pattern 1: health readers consume one canonical policy artifact instead of recomputing degraded truth."
  - "Pattern 2: drift and reconciliation freshness are first-class policy inputs, not secondary annotations."
requirements-completed: [TRUTH-DEGRADE-01, TRUTH-OPS-01]
context_artifact_ids: [phase-75-degraded-policy]
duration: 40min
completed: 2026-03-27
---

# Phase 75 Plan 01 Summary

**Phase 75 now has a canonical degraded-policy layer that normalizes subsystem health into `HEALTHY | DEGRADED | UNSAFE`, writes `.planning/health/latest-degraded-state.json`, and exposes the same truth through `brain health` and `health degraded-mode`**

## Performance

- **Duration:** 40 min
- **Completed:** 2026-03-27T22:05:00Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments

- Added `get-stuff-done/bin/lib/degraded-mode.cjs` to normalize raw subsystem status, fold in drift and reconciliation freshness, compute aggregate policy state, and persist `.planning/health/latest-degraded-state.json`.
- Wired `get-stuff-done/bin/lib/brain-manager.cjs` to embed canonical degraded-policy truth in `brain health --raw`.
- Upgraded `get-stuff-done/bin/lib/commands.cjs` so `health degraded-mode` reads the same policy snapshot and reports blocked workflows, warnings, fallbacks, and source path.
- Added focused tests for canonical normalization, worst-state aggregation, stale-truth handling, and diagnostic reader behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: implement canonical degraded-state policy and align health reader surfaces** - `b2031d0` (feat)

## Proof Index

```json
[
  {
    "task": 1,
    "canonical_commit": "b2031d0",
    "files": [
      "get-stuff-done/bin/lib/degraded-mode.cjs",
      "get-stuff-done/bin/lib/brain-manager.cjs",
      "get-stuff-done/bin/lib/commands.cjs",
      "tests/degraded-mode-policy.test.cjs",
      "tests/brain-health.test.cjs",
      "tests/enforcement.test.cjs"
    ],
    "verify": "node --test tests/degraded-mode-policy.test.cjs tests/brain-health.test.cjs tests/enforcement.test.cjs",
    "evidence": [
      "node --check get-stuff-done/bin/lib/degraded-mode.cjs",
      "node --check get-stuff-done/bin/lib/brain-manager.cjs",
      "node --check get-stuff-done/bin/lib/commands.cjs",
      "node --test tests/degraded-mode-policy.test.cjs tests/brain-health.test.cjs tests/enforcement.test.cjs"
    ],
    "runtime_required": true,
    "runtime_proof": [
      "node get-stuff-done/bin/gsd-tools.cjs brain health --raw",
      "node get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw"
    ]
  }
]
```

## Files Created/Modified

- `get-stuff-done/bin/lib/degraded-mode.cjs` - canonical degraded-policy evaluator, freshness contract, blocked-workflow logic, and runtime artifact writer
- `get-stuff-done/bin/lib/brain-manager.cjs` - health surface now exposes canonical degraded-policy truth
- `get-stuff-done/bin/lib/commands.cjs` - degraded-mode reader surface now reads the shared policy snapshot
- `tests/degraded-mode-policy.test.cjs` - deterministic coverage for canonical vocabulary, freshness degradation, and aggregate-state selection
- `tests/brain-health.test.cjs` - verifies health output includes canonical degraded-policy fields
- `tests/enforcement.test.cjs` - verifies degraded-mode reader output stays aligned with the shared policy surface

## Decisions Made

- `UNHEALTHY`, `error`, `blocked`, and similar raw labels now collapse into the canonical degraded-policy vocabulary before operator presentation.
- Stale or missing drift and reconciliation truth can degrade policy state without blocking diagnostic inspection commands.
- The degraded-policy module treats current live health and truth-artifact freshness as one combined enforcement input.

## Deviations from Plan

None - the canonical policy module, artifact writer, and shared reader-surface contract all landed inside the planned scope.

## Issues Encountered

- The initial freshness mapper treated the healthy drift-report state from Phase 73 as missing because it returned `ok` instead of `fresh`; the policy mapper was corrected so fresh drift truth does not falsely degrade the system.

## Next Phase Readiness

- Plan 75-02 can now enforce truth-bearing workflow blocking off the persisted degraded-policy artifact instead of rebuilding policy inline.
- Later phases can consume `.planning/health/latest-degraded-state.json` as the canonical operational truth surface.

## Self-Check: PASSED

- PASSED: `node --check get-stuff-done/bin/lib/degraded-mode.cjs`
- PASSED: `node --check get-stuff-done/bin/lib/brain-manager.cjs`
- PASSED: `node --check get-stuff-done/bin/lib/commands.cjs`
- PASSED: `node --test tests/degraded-mode-policy.test.cjs tests/brain-health.test.cjs tests/enforcement.test.cjs`
- PASSED: `node get-stuff-done/bin/gsd-tools.cjs brain health --raw`
- PASSED: `node get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw`
- FOUND: `b2031d0`

---
*Phase: 75-degraded-mode-enforcement*
*Completed: 2026-03-27*

<!-- GSD-AUTHORITY: 75-01-1:849e3e4da8f2b21c5c2c8b65e9e1cbf7c5337e3bee1f2a33d5367490db526eb6 -->

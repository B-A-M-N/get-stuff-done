---
phase: 73-drift-detection-engine
plan: 02
subsystem: drift-operator-surfaces
tags: [drift, cli, health, status, operator]
requires:
  - phase: 73-01
    provides: canonical latest-report contract and predicted-impact fields
provides:
  - drift scan, report, and canonical status CLI surfaces
  - operator health visibility for active drift truth
  - severity-based scan exit behavior for pipelines
affects: [drift-detection, operator-surfaces, verification, reconciliation]
tech-stack:
  added: []
  patterns:
    - status, report, and health read one persisted drift artifact rather than recomputing
    - missing or stale report state is surfaced explicitly instead of implied healthy
key-files:
  created:
    - tests/drift-cli.test.cjs
    - tests/brain-health.test.cjs
  modified:
    - get-stuff-done/bin/gsd-tools.cjs
    - get-stuff-done/bin/lib/brain-manager.cjs
key-decisions:
  - "Only `drift scan` enforces non-zero exit on active CRITICAL drift; status and report remain readable operator surfaces."
  - "Brain health now exposes drift truth from the persisted latest report without recomputing scan logic."
patterns-established:
  - "Pattern 1: missing report state is visible across status, report, and health surfaces."
  - "Pattern 2: operator truth surfaces read the same machine artifact used by later reconciliation."
requirements-completed: [TRUTH-DRIFT-02, TRUTH-OPS-01]
context_artifact_ids: [phase-73-operator-surfaces]
duration: 30min
completed: 2026-03-27
---

# Phase 73 Plan 02 Summary

**Phase 73 now exposes the drift engine through `drift scan`, `drift report`, `drift status`, and `brain health`, all reading the same persisted report contract**

## Performance

- **Duration:** 30 min
- **Completed:** 2026-03-27T20:18:00Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Added CLI surfaces in `get-stuff-done/bin/gsd-tools.cjs` for `drift scan`, `drift report`, and canonical `drift status`.
- Wired `get-stuff-done/bin/lib/brain-manager.cjs` to surface active drift truth from `.planning/drift/latest-report.json`.
- Added focused tests proving deterministic scan output, explicit missing-report behavior, historical suppression in status, and drift visibility in brain health.
- Exercised the real repo path: `node get-stuff-done/bin/gsd-tools.cjs drift scan --raw` now writes `.planning/drift/latest-report.json`, and `node get-stuff-done/bin/gsd-tools.cjs drift status` renders active findings from that artifact.

## Task Commits

Each task was committed atomically:

1. **Task 1: expose drift CLI and brain-health surfaces on top of the persisted report contract** - `44b8772` (feat)

## Proof Index

```json
[
  {
    "task": 1,
    "canonical_commit": "44b8772",
    "files": [
      "get-stuff-done/bin/gsd-tools.cjs",
      "get-stuff-done/bin/lib/brain-manager.cjs",
      "tests/drift-cli.test.cjs"
      ,
      "tests/brain-health.test.cjs"
    ],
    "verify": "node --test tests/brain-health.test.cjs tests/second-brain-status.test.cjs",
    "evidence": [
      "node --test tests/drift-cli.test.cjs",
      "node --test tests/brain-health.test.cjs tests/second-brain-status.test.cjs",
      "node get-stuff-done/bin/gsd-tools.cjs drift status",
      "node get-stuff-done/bin/gsd-tools.cjs brain health --raw"
    ],
    "runtime_required": true,
    "runtime_proof": [
      "node get-stuff-done/bin/gsd-tools.cjs brain health --raw"
    ]
  }
]
```

## Files Created/Modified

- `get-stuff-done/bin/gsd-tools.cjs` - exposes scan/report/status drift commands and severity-based scan exit behavior
- `get-stuff-done/bin/lib/brain-manager.cjs` - surfaces drift health from the persisted report artifact
- `tests/drift-cli.test.cjs` - verifies scan persistence, report/status behavior, and missing-report handling
- `tests/brain-health.test.cjs` - verifies brain health reports drift truth explicitly

## Decisions Made

- `drift report` and `drift status` stay readable even when the report is missing or stale; they do not invent a healthy state.
- `brain health` reads the latest drift report instead of embedding a second drift evaluator.
- The scan exit code is the pipeline signal; status and health remain descriptive operator surfaces.

## Deviations from Plan

None - the CLI cluster, persisted report reader pattern, and health integration all landed within the planned boundary.

## Issues Encountered

- The CLI report test initially went stale because the fixture timestamp was fixed while the stale-window check used the live clock; the fixture was changed to use current time so the test measures contract behavior rather than wall-clock drift.

## Next Phase Readiness

- Phase 74 can now reconcile active findings from `.planning/drift/latest-report.json` with source-attributed `affected` and `predicted_effect` fields already in place.
- Operators can already see when the system is lying before reconciliation starts mutating status surfaces.

## Self-Check: PASSED

- PASSED: `node --check get-stuff-done/bin/gsd-tools.cjs`
- PASSED: `node --check get-stuff-done/bin/lib/brain-manager.cjs`
- PASSED: `node --test tests/drift-cli.test.cjs tests/brain-health.test.cjs tests/second-brain-status.test.cjs`
- PASSED: `node get-stuff-done/bin/gsd-tools.cjs drift status`
- FOUND: `44b8772`

---
*Phase: 73-drift-detection-engine*
*Completed: 2026-03-27*

<!-- GSD-AUTHORITY: 73-02-2:fced301b8816de5b900ca45ad6d6917661a23957c1d7ba609906939820021307 -->

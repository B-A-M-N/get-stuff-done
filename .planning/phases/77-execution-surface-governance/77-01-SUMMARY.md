---
phase: 77-execution-surface-governance
plan: 01
subsystem: command-governance
tags: [governance, policy, cli, degraded-mode]
requires:
  - phase: 75
    provides: degraded truth posture reused as the only policy input
  - phase: 76
    provides: audited truth-bearing boundary inventory that informs route classification coverage
provides:
  - canonical command governance policy map
  - deterministic route classification helper
  - default warn_only fallback for future commands
affects: [cli, degraded-mode, operator-surfaces]
tech-stack:
  added: []
  patterns:
    - governance classification is declared in policy and loaded by one helper rather than duplicated across CLI routes
    - route identity is normalized as command plus subcommand plus mode so authoritative and exploratory workflows can diverge cleanly
key-files:
  created:
    - .planning/policy/command-governance.yaml
    - get-stuff-done/bin/lib/command-governance.cjs
    - tests/command-governance.test.cjs
  modified: []
key-decisions:
  - "New commands default to warn_only until explicitly classified."
  - "Classification stays policy-driven and deterministic, with per-route workflow support."
patterns-established:
  - "Pattern 1: governance policy files are machine-readable JSON-in-YAML artifacts that can still carry authority envelopes."
  - "Pattern 2: command routes resolve through one helper that owns normalization, policy matching, and workflow mapping."
requirements-completed: [TRUTH-DEGRADE-01, TRUTH-BYPASS-01, TRUTH-OPS-01]
context_artifact_ids: [phase-77-execution-surface-governance]
duration: 22min
completed: 2026-03-27
---

# Phase 77 Plan 01 Summary

**Phase 77 now has one canonical command governance map and one deterministic lookup layer, so CLI routes can classify truth transitions, recovery paths, and warn-only execution without scattering policy across handlers**

## Performance

- **Duration:** 22 min
- **Completed:** 2026-03-27T23:15:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Added `.planning/policy/command-governance.yaml` as the single source of truth for route classifications and default governance behavior.
- Added `get-stuff-done/bin/lib/command-governance.cjs` to load the policy, normalize routes, resolve workflow-aware classifications, and build governance warnings or blocks.
- Added `tests/command-governance.test.cjs` to cover route normalization, hard-gated planning workflows, recovery diagnostics, and default `warn_only` fallback behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: define the canonical command governance map and deterministic lookup helper** - `eddfc5d` (feat)

## Proof Index

```json
[
  {
    "task": 1,
    "canonical_commit": "eddfc5d",
    "files": [
      ".planning/policy/command-governance.yaml",
      "get-stuff-done/bin/lib/command-governance.cjs",
      "tests/command-governance.test.cjs"
    ],
    "verify": "node --check get-stuff-done/bin/lib/command-governance.cjs && node --test tests/command-governance.test.cjs",
    "evidence": [
      "node --check get-stuff-done/bin/lib/command-governance.cjs",
      "node --test tests/command-governance.test.cjs"
    ],
    "runtime_required": false,
    "runtime_proof": []
  }
]
```

## Files Created/Modified

- `.planning/policy/command-governance.yaml` - canonical per-route governance policy
- `get-stuff-done/bin/lib/command-governance.cjs` - governance policy loader, resolver, and warning/block builder
- `tests/command-governance.test.cjs` - focused governance lookup regression coverage

## Decisions Made

- Policy matching prefers exact command-subcommand-mode matches, then falls back to broader command or command-subcommand matches.
- Governance classes remain closed to the four locked values rather than allowing ad hoc additions.

## Issues Encountered

- The Phase 77 planning artifacts existed in the workspace but had not been authority-signed, so planning validation initially failed until the phase docs were signed and revalidated.

## Next Phase Readiness

- Phase 77 Plan 02 can now wire the governance map into CLI routing without duplicating route classification logic.
- Later phases can reuse the same policy file for audit and UX refinement rather than creating parallel governance metadata.

## Self-Check: PASSED

- PASSED: `node --check get-stuff-done/bin/lib/command-governance.cjs`
- PASSED: `node --test tests/command-governance.test.cjs`
- FOUND: `eddfc5d`

---
*Phase: 77-execution-surface-governance*
*Completed: 2026-03-27*

<!-- GSD-AUTHORITY: 77-01-1:aab0e323746d87d23bb9c090d6b96e4f9ae10e8e0b01fd11d1cc9811f323423f -->

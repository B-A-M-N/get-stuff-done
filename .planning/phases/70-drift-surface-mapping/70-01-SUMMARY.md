---
phase: 70-drift-surface-mapping
plan: 01
subsystem: infra
tags: [truth-enforcement, drift-catalog, authority, cli, testing]
requires:
  - phase: 55
    provides: installed-runtime truth-surface lessons from Open Brain closeout
provides:
  - machine-readable Phase 70 drift catalog contract
  - sanctioned `drift catalog` CLI path
  - YAML-safe authority envelope support for machine truth artifacts
affects: [verification, operator-surface, degraded-mode, milestone-audit]
tech-stack:
  added: []
  patterns:
    - machine-first truth artifacts must stay syntactically valid under authority signing
    - drift inventories should bind requirement, implementation, and evidence in one artifact
key-files:
  created:
    - get-stuff-done/bin/lib/drift-catalog.cjs
    - .planning/phases/70-drift-surface-mapping/drift_catalog.yaml
    - tests/drift-catalog.test.cjs
  modified:
    - get-stuff-done/bin/lib/authority.cjs
    - get-stuff-done/bin/lib/core.cjs
    - get-stuff-done/bin/gsd-tools.cjs
    - tests/core-safeWriteFile.test.cjs
    - tests/authority.test.cjs
key-decisions:
  - "YAML truth artifacts use `# GSD-AUTHORITY:` envelopes so machine-first outputs remain valid YAML."
  - "Phase 70 exposes a narrow `drift catalog` CLI path instead of prematurely shipping a full detection engine."
patterns-established:
  - "Pattern 1: truth-surface catalogs are generated from observable probes and checked in as signed machine artifacts."
  - "Pattern 2: installed-runtime and repo-local truth surfaces are inventoried separately when they can diverge."
requirements-completed: [TRUTH-CLAIM-01, TRUTH-DRIFT-01]
context_artifact_ids: []
duration: 12min
completed: 2026-03-27
---

# Phase 70 Plan 01: Machine-First Drift Catalog Summary

**Phase 70 now has a signed machine-readable drift catalog and a sanctioned CLI path that inventories planning, runtime, degraded-mode, memory-boundary, and recent structural history surfaces without relying on markdown interpretation**

## Performance

- **Duration:** 12min
- **Started:** 2026-03-27T17:47:00Z
- **Completed:** 2026-03-27T17:59:10Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added YAML-safe authority envelope support so machine-first truth artifacts can be signed without corrupting syntax.
- Built `get-stuff-done/bin/lib/drift-catalog.cjs` and the `drift catalog` CLI path for deterministic Phase 70 truth-surface inventory.
- Generated `.planning/phases/70-drift-surface-mapping/drift_catalog.yaml` with requirement-bound entries spanning planning artifacts, runtime surfaces, degraded-mode surfaces, memory boundaries, and recent structural history.

## Task Commits

Implementation was captured in one scoped execution commit:

1. **Plan 70-01 implementation and artifact generation** - `f113c5d` (feat)

## Files Created/Modified

- `get-stuff-done/bin/lib/authority.cjs` - adds YAML-aware authority envelope parsing/formatting.
- `get-stuff-done/bin/lib/core.cjs` - routes signed YAML writes through the correct envelope style.
- `get-stuff-done/bin/lib/drift-catalog.cjs` - generates the Phase 70 truth-surface catalog and renders signed YAML.
- `get-stuff-done/bin/gsd-tools.cjs` - adds the narrow `drift catalog` CLI surface.
- `tests/drift-catalog.test.cjs` - locks the catalog contract, truth-surface coverage, and signed YAML output.
- `.planning/phases/70-drift-surface-mapping/drift_catalog.yaml` - checked-in machine-first source of truth for Phase 70 inventory.

## Decisions Made

- Kept Phase 70 scoped to catalog generation and evidence binding, not speculative reconciliation or enforcement.
- Treated installed-runtime behavior as first-class catalog evidence because recent milestone closure already proved repo-local truth is not enough.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] YAML truth artifacts were incompatible with the existing authority envelope format**
- **Found during:** Task 2 (machine artifact generation)
- **Issue:** non-markdown files were always signed with `//` envelopes, which would invalidate `drift_catalog.yaml`
- **Fix:** added `#` envelope support in the authority and safe-write path, with regression coverage
- **Files modified:** `get-stuff-done/bin/lib/authority.cjs`, `get-stuff-done/bin/lib/core.cjs`, `tests/core-safeWriteFile.test.cjs`, `tests/authority.test.cjs`
- **Verification:** `node --test tests/core-safeWriteFile.test.cjs` and `node tests/authority.test.cjs`
- **Committed in:** `f113c5d`

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking issue)
**Impact on plan:** The fix stayed inside the machine-artifact boundary and was necessary for a truthful signed YAML catalog.

## Issues Encountered

The first catalog pass showed that signing rules were markdown/code-biased and would silently produce invalid YAML. That had to be repaired before the machine-first artifact could be trusted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 70 has a checked-in machine source of truth for downstream proof-chain and drift-engine work.
- Later phases can consume the catalog through a sanctioned CLI path instead of ad hoc scripts.
- Classification and human-readable hotspot reporting can now layer on top of the catalog without redefining the source of truth.

## Self-Check: PASSED

- FOUND: `.planning/phases/70-drift-surface-mapping/drift_catalog.yaml`
- PASSED: `node --check get-stuff-done/bin/lib/drift-catalog.cjs`
- PASSED: `node --check get-stuff-done/bin/gsd-tools.cjs`
- PASSED: `node --test tests/drift-catalog.test.cjs`
- FOUND: `f113c5d`

---
*Phase: 70-drift-surface-mapping*
*Completed: 2026-03-27*

<!-- GSD-AUTHORITY: 70-01-1:54a2c75961af55f6086aba18c0ef00f87faa454693459d940c26132e09f9a8a5 -->

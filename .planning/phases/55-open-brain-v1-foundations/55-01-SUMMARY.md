---
phase: 55-open-brain-v1-foundations
plan: 01
subsystem: infra
tags: [open-brain, postgres, pgvector, fastembed, degraded-mode]
requires:
  - phase: 54
    provides: sanctioned Second Brain workflow-memory boundaries and degraded-mode posture
provides:
  - separate gsd_open_brain bootstrap contract and graph-ready relational tables
  - local fastembed-target embedding adapter with explicit capability reporting
  - optional Open Brain readiness surface that does not block planner or executor flows
affects: [55-open-brain-v1-foundations, semantic-recall, planning-context, second-brain-boundary]
tech-stack:
  added: []
  patterns: [open-brain-sidecar, optional-semantic-recall, local-embedding-adapter]
key-files:
  created:
    - get-stuff-done/bin/lib/open-brain.cjs
    - get-stuff-done/bin/lib/open-brain-embedder.cjs
    - scripts/init-open-brain.sql
    - tests/open-brain-schema.test.cjs
    - tests/open-brain-degraded-mode.test.cjs
    - .planning/phases/55-open-brain-v1-foundations/55-01-SUMMARY.md
  modified:
    - get-stuff-done/bin/gsd-tools.cjs
key-decisions:
  - "Open Brain foundation lives in `gsd_open_brain` as a sidecar contract and explicitly leaves execution truth with Second Brain."
  - "The default embedding target is `fastembed`, but the adapter reports unavailable capability instead of making local embeddings a hard runtime dependency."
  - "Operator visibility is limited to a truthful `brain open-status` readiness surface so Open Brain health is observable without conflating it with Second Brain backend truth."
patterns-established:
  - "Pattern: Open Brain storage/bootstrap concerns live in dedicated `open-brain*.cjs` helpers instead of extending `second-brain.cjs` tables."
  - "Pattern: semantic-recall prerequisites degrade to structured unavailable metadata while planner/executor workflows continue."
requirements-completed: [OPEN-BRAIN-01, OPEN-BRAIN-02, OPEN-BRAIN-06]
duration: 2min
completed: 2026-03-27
---

# Phase 55 Plan 01: Open Brain V1 Foundations Summary

**Separate `gsd_open_brain` bootstrap, graph-ready memory tables, and a fastembed-target local embedding adapter now establish Open Brain as an optional sidecar foundation with explicit degraded-mode readiness.**

## Performance

- **Duration:** 2min
- **Started:** 2026-03-27T08:20:48-05:00
- **Completed:** 2026-03-27T08:22:34-05:00
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `scripts/init-open-brain.sql` and `get-stuff-done/bin/lib/open-brain.cjs` to define a separate `gsd_open_brain` schema, `pgvector` bootstrap, and the canonical sidecar contract.
- Added `get-stuff-done/bin/lib/open-brain-embedder.cjs` with a narrow local provider abstraction targeting `fastembed` by default and reporting clean capability gaps when unavailable.
- Added focused schema and degraded-mode tests plus a minimal `brain open-status` CLI surface so Open Brain readiness is observable without becoming a hard dependency.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the Open Brain schema/bootstrap contract and public sidecar surface** - `04e4daa` (feat)
2. **Task 2: Add a local embedding adapter and safe degraded behavior for Open Brain foundation** - `26fd4b5` (feat)
3. **Task 3: Verify foundation contract and syntax** - `045221b` (chore)

**Plan metadata:** pending

## Files Created/Modified

- `get-stuff-done/bin/lib/open-brain.cjs` - owns Open Brain schema contract, bootstrap loading, and readiness checks.
- `get-stuff-done/bin/lib/open-brain-embedder.cjs` - exposes the local embedding provider abstraction and default `fastembed` target posture.
- `get-stuff-done/bin/gsd-tools.cjs` - adds `brain open-status` for truthful sidecar readiness reporting.
- `scripts/init-open-brain.sql` - bootstraps `gsd_open_brain`, `pgvector`, and graph-ready relational tables.
- `tests/open-brain-schema.test.cjs` - pins the separate schema/bootstrap contract and table ownership boundary.
- `tests/open-brain-degraded-mode.test.cjs` - verifies storage-side and embedding-side failures degrade safely.

## Decisions Made

- Kept Open Brain foundation separate from `gsd_local_brain.workflow_memory`, using a distinct `gsd_open_brain` schema and explicit sidecar metadata.
- Treated missing local embedding capability as a degraded Open Brain condition instead of a workflow-wide failure, because semantic recall is optional in this phase.
- Added only a minimal CLI readiness surface so operators can inspect Open Brain status without changing existing planner, executor, Firecrawl, or Second Brain flows.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `fastembed` is not installed in the current repo, so the adapter was implemented to surface a truthful unavailable capability result instead of failing imports or requiring new dependencies in this foundation plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 55 now has the sidecar schema/bootstrap and degraded-mode contract needed for ingestion and bounded retrieval work.
- Future plans can build ingestion, ranking, and workflow integration on `open-brain.cjs` without reopening the Second Brain execution-truth boundary.

## Self-Check: PASSED

- Found summary file: `.planning/phases/55-open-brain-v1-foundations/55-01-SUMMARY.md`
- Found commit: `04e4daa`
- Found commit: `26fd4b5`
- Found commit: `045221b`

---
*Phase: 55-open-brain-v1-foundations*
*Completed: 2026-03-27*

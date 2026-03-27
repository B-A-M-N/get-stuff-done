---
phase: 54-model-facing-second-brain-via-mcp
plan: 01
subsystem: infra
tags: [mcp, postgres, sqlite, second-brain, toolbox]
requires:
  - phase: 53
    provides: truthful backend-state tracking and degraded-mode operator surfaces
provides:
  - curated workflow-memory helpers in Second Brain
  - checked-in MCP toolbox contract for planner read-only and executor append-only access
  - explicit degraded-mode blocking for model-facing memory reads and writes
affects: [54-model-facing-second-brain-via-mcp, planning-context, executor-memory]
tech-stack:
  added: []
  patterns: [curated-workflow-memory, postgres-required-model-memory, least-privilege-toolsets]
key-files:
  created:
    - .planning/phases/54-model-facing-second-brain-via-mcp/toolbox/tools.yaml
    - tests/second-brain-mcp-tools.test.cjs
    - tests/brain-mcp-degraded-mode.test.cjs
    - .planning/phases/54-model-facing-second-brain-via-mcp/54-01-SUMMARY.md
  modified:
    - get-stuff-done/bin/lib/second-brain.cjs
    - get-stuff-done/bin/lib/brain-manager.cjs
    - .planning/phases/54-model-facing-second-brain-via-mcp/54-VALIDATION.md
key-decisions:
  - "Model-facing memory reads and writes use dedicated wrappers that call `requirePostgres()` and fail closed with structured blocked results."
  - "Planner/executor model access is defined by a checked-in toolbox contract with separate `planner_memory_readonly` and `executor_memory_rw` toolsets."
  - "Workflow memory is stored in a curated `workflow_memory` table instead of exposing raw audit or artifact tables to model-facing retrieval."
patterns-established:
  - "Pattern: model-facing memory is a Postgres-only contract even when general Second Brain runtime degrades to SQLite."
  - "Pattern: planner tool surfaces stay read-only while executor writeback is limited to append-style curated memory."
requirements-completed:
  - MEMORY-MCP-01
duration: session-based
completed: 2026-03-27
---

# Phase 54 Plan 01: Model-Facing Second Brain via MCP Summary

**Curated workflow memory now ships behind a checked-in MCP toolbox contract with Postgres-required degraded-mode blocking for planner and executor memory access.**

## Performance

- **Duration:** session-based
- **Started:** 2026-03-27T00:00:00Z
- **Completed:** 2026-03-27T00:00:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added `upsertWorkflowMemory()` and `listWorkflowMemory()` backed by a dedicated `workflow_memory` table in Postgres and SQLite.
- Checked in a concrete Phase 54 toolbox contract with `planner_memory_readonly`, `executor_memory_rw`, `memory_search`, and `memory_write_checkpoint`.
- Added explicit model-facing read/write guardrails so degraded SQLite fallback blocks planner and executor memory operations instead of silently changing semantics.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add curated workflow-memory storage and checked-in MCP Toolbox contract** - `86dca66` (test), `e7ce709` (feat)
2. **Task 2: Enforce degraded-mode and Postgres-required behavior for model-facing memory** - `e30466c` (test), `eaf3824` (feat)
3. **Task 3: Verify syntax, config shape, and focused foundation behavior** - `7700bae` (chore)

**Plan metadata:** pending

## Files Created/Modified
- `.planning/phases/54-model-facing-second-brain-via-mcp/toolbox/tools.yaml` - checked-in MCP toolbox contract with planner/executor toolset split
- `get-stuff-done/bin/lib/second-brain.cjs` - curated workflow-memory table/bootstrap plus Postgres-required model-memory wrappers
- `get-stuff-done/bin/lib/brain-manager.cjs` - explicit `model_facing_memory` operator status surface
- `tests/second-brain-mcp-tools.test.cjs` - toolbox contract and curated storage regression coverage
- `tests/brain-mcp-degraded-mode.test.cjs` - degraded-mode blocking coverage for model-facing reads and writes
- `.planning/phases/54-model-facing-second-brain-via-mcp/54-VALIDATION.md` - focused verification status for the completed Phase 54 foundation tests

## Decisions Made
- Reused the Phase 53 `requirePostgres()` posture instead of creating a second degraded-state mechanism for model-facing memory.
- Kept the checked-in toolbox contract declarative and least-privilege, with no planner-facing `execute_sql` exposure.
- Limited this plan to the safe foundation for model-facing memory; bounded context-pack assembly and Firecrawl-boundary validation remain follow-on work.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The Task 1 RED commit also captured the already-staged Phase 54 research file present in the dirty tree. Subsequent task commits were staged surgically to avoid bundling unrelated work from shared files.
- The initial planner toolset test over-matched YAML sections; the matcher was tightened before the GREEN pass so it asserted the intended block boundaries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 54 now has the sanctioned toolbox contract and the Postgres-required guardrails needed for later planner/executor integration work.
- `MEMORY-MCP-02` is not complete yet; bounded memory-pack context assembly and Firecrawl-boundary enforcement still need to land in the remaining Phase 54 work.

## Self-Check: PASSED

- Found summary file: `.planning/phases/54-model-facing-second-brain-via-mcp/54-01-SUMMARY.md`
- Found commit: `86dca66`
- Found commit: `e7ce709`
- Found commit: `e30466c`
- Found commit: `eaf3824`
- Found commit: `7700bae`

---
*Phase: 54-model-facing-second-brain-via-mcp*
*Completed: 2026-03-27*

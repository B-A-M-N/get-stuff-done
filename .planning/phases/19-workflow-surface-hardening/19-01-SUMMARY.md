---
phase: 19-workflow-surface-hardening
plan: 01
subsystem: orchestrator
tags: [hardening, library, schema, validation]

# Dependency graph
requires:
  - phase: 18-context-enrichment
    provides: 18-01 (Harvesting Logic), 18-02 (Workflow Integration)
provides:
  - Blocked-state gates in `research-phase.md` and `validate-phase.md`
  - Reconciled internal workflow library in `workflows/lib/`
  - New `/gsd:diagnose` command for parallel gap diagnosis
  - Upgraded `SUMMARY.md` verification with Zod schema enforcement
affects: [research-phase.md, validate-phase.md, verify.cjs, verify.test.cjs, diagnose.md]

# Tech tracking
tech-stack:
  added: []
  patterns: [internal-workflow-library, schema-enforced-verification]

key-files:
  created:
    - commands/gsd/diagnose.md
    - get-stuff-done/workflows/lib/
  modified:
    - get-stuff-done/bin/lib/verify.cjs
    - tests/verify.test.cjs
    - All primary workflows (updated lib references)

key-decisions:
  - "Extract internal sub-processes into a `lib/` directory to clarify the primary CLI surface and reduce noise in the workflows folder."
  - "Expose the `diagnose-issues` workflow via a dedicated `/gsd:diagnose` command to make parallel debugging accessible to users."
  - "Upgrade SUMMARY.md verification to use Zod schemas, ensuring all completion reports are machine-readable and structurally valid."

patterns-established:
  - "Separation of public workflows and internal library processes"

requirements-completed:
  - SURFACE-01 (Blocked-state gate check for research/validate)
  - SURFACE-02 (Autonomous blocked awareness)
  - SURFACE-03 (Orphaned workflow reconciliation)
  - SCHEMA-02 (SUMMARY.md schema contract)
  - SCHEMA-03 (cmdVerifySummary upgraded to use schema)

# Metrics
duration: 25min
completed: 2026-03-17
---

# Phase 19 Plan 01: Workflow Surface Hardening Summary

**Hardened the enforcement model for all workflow surfaces, reconciled orphaned files, and implemented schema-enforced verification.**

## Performance

- **Duration:** 25 min
- **Tasks:** 6
- **Files modified:** 15+

## Accomplishments
- **Runtime Gates:** Injected `Clarification Gates` into `research-phase.md` and `validate-phase.md`, ensuring all primary entry points now respect the `blocked` state.
- **Workflow Library:** Created `get-stuff-done/workflows/lib/` and moved internal processes (`discovery-phase`, `node-repair`, `verify-phase`, `transition`, `diagnose-issues`) there. Updated all internal references across 8 primary workflow files.
- **New Command:** Implemented `/gsd:diagnose` as a public interface for the parallel diagnostic workflow, improving the toolkit for UAT gap closure.
- **Schema Enforcement:** Refactored `cmdVerifySummary` in `verify.cjs` to validate `SUMMARY.md` frontmatter against the `executionSummarySchema` (Zod).
- **Test Coverage:** Updated and expanded `tests/verify.test.cjs` to cover the new schema validation logic and ensure all tests pass with the new format.

## Task Commits

1. **Task 1: Fix gsd-tools.cjs paths in research and validate workflows** - `a727b99`
2. **Task 2: Move internal workflows to lib/ directory** - `4ea1f9d`
3. **Task 3: Update workflow references to lib/ directory** - `f9d4369`
4. **Task 4: Expose parallel diagnosis command (/gsd:diagnose)** - `7add8a7`
5. **Task 5: Add executionSummarySchema import to verify.cjs** - `9b82026`
6. **Task 6: Refactor cmdVerifySummary and add tests** - (committing now)

## Next Phase Readiness
- Phase 19 is 100% complete.
- The orchestration engine is structurally hardened and its artifacts are strictly validated.
- Ready for Phase 20: Scenario and Contract Tests.

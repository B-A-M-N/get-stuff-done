# Phase 21 Research: Brownfield Resilience (Mega Audit)

**Goal:** Stress-test v0.2.0 orchestration integrity against un-sanitized legacy project data.

## 1. Schema & Artifact Integrity (Vectors 1)
Legacy `SUMMARY.md` files (Phases 1-14) use a different frontmatter structure (e.g., `name` instead of `subsystem`, missing `duration`, `completed`).
- **Risk:** `cmdVerifySummary` throws Zod errors that crash the orchestrator or provide unhelpful "invalid" blocks without recovery.
- **Strategy:** Refactor `executionSummarySchema` to be partially permissive for legacy phases or ensure `cmdVerifySummary` handles "Legacy Compliance" as a valid state with warnings instead of hard failures.

## 2. Runtime Gate Enforcement & Deadlocks (Vector 2)
Brownfield projects often have "ghost" ambiguities in `STATE.md` that weren't tracked by ITL.
- **Risk:** `resume-project` sees `clarification_status: blocked` but the ITL cannot find the matching `CHECKPOINT.md` or the `why_blocked` context is contradictory.
- **Strategy:** Implement a "Repair State" path in `resume-project` that triggers if a block exists without a corresponding artifact.

## 3. Pre-Flight Context Harvesting (Vector 3)
Massive `STATE.md` files (2,000+ lines) can exceed context windows.
- **Risk:** `harvestAmbientContext` pulls too much junk, leading to model hallucinations or truncated JSON.
- **Strategy:** Implement token-aware truncation in `state.cjs` for context harvesting.

## 4. Orphaned Workflow Reconciliation (Vector 4)
Workflows moved to `lib/` (e.g., `diagnose-issues.md`) might have hardcoded paths in old versions.
- **Risk:** Resuming a legacy task that points to a non-existent workflow path.
- **Strategy:** Verify all redirections in `workflows/lib/` are backward-compatible.

## 5. Implementation Sequence
1. **Plan 21-01:** Schema Resilience & Legacy Fixtures (Vector 1).
2. **Plan 21-02:** Deadlock Detection & State Repair (Vector 2).
3. **Plan 21-03:** Large-Scale Context Harvesting & Truncation (Vector 3).
4. **Plan 21-04:** Workflow Library Backward Compatibility (Vector 4).

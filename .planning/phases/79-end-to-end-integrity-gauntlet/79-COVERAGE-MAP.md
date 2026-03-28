# Phase 79 Coverage Map

| Failure Class | Requirements | Single | Mixed | Scenarios | Surfaces |
|---------------|--------------|--------|-------|-----------|----------|
| fake_verification | TRUTH-GAUNTLET-01, TRUTH-BYPASS-01 | 2 | 1 | fake-verification-forged-verdict, fake-verification-missing-truth-table, mixed-fake-proof-and-drift | verification, phase-truth, drift-report |
| missing_commits | TRUTH-GAUNTLET-01, TRUTH-BYPASS-01 | 2 | 1 | missing-commit-proof-chain, missing-proof-index-commit, mixed-missing-commit-and-undeclared-degradation | summary, commit-proof, degraded-state |
| partial_execution | TRUTH-GAUNTLET-01, TRUTH-BYPASS-01 | 3 | 1 | partial-execution-summary-claim, partial-execution-task-gap, checkpoint-orphan-block, mixed-partial-execution-and-fake-verification | summary, verification, complete-task, task-log, checkpoint, verify-integrity, governance |
| degraded_subsystem | TRUTH-DEGRADE-01, TRUTH-GAUNTLET-01 | 5 | 1 | declared-memory-degradation, declared-firecrawl-degradation, undeclared-memory-degradation, firecrawl-context-governance-bypass, mixed-declared-firecrawl-and-undeclared-memory, plane-configured-truth-path | health-degraded-mode, memory-truth, firecrawl, retrieval-posture, degraded-state, context-build, governance, plane |
| drift_contradiction | TRUTH-DRIFT-02, TRUTH-GAUNTLET-01 | 3 | 1 | memory-truth-contradiction, retrieval-truth-posture-downgrade, drift-reconciliation-trigger, mixed-retrieval-downgrade-and-memory-contradiction | memory-truth, drift-report, firecrawl, retrieval-posture, context-build, reconciliation |

## Explicit Requirement Notes

- Retrieval-facing truth posture is covered by scenarios that include `retrieval-posture` surfaces.
- Authoritative context-build coverage is covered by scenarios that include `context-build` surfaces.
- Memory truth contradiction coverage is covered by scenarios that include `memory-truth` plus either `drift-report` or `degraded-state`.
- Plane-configured coverage is preserved as capability-gated live coverage through `plane-configured-truth-path`.

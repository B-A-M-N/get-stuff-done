# Phase 79 Integrity Gauntlet Spec

This catalog is the authoritative hostile contract for Phase 79.

| Scenario | Failure Class | Chain | Surfaces | Expected | Modes |
|----------|---------------|-------|----------|----------|-------|
| fake-verification-forged-verdict | fake_verification | single | verification, phase-truth | INVALID | deterministic |
| fake-verification-missing-truth-table | fake_verification | single | verification | INVALID | deterministic |
| missing-commit-proof-chain | missing_commits | single | summary, commit-proof | INVALID | deterministic |
| missing-proof-index-commit | missing_commits | single | summary, commit-proof | INVALID | deterministic |
| partial-execution-summary-claim | partial_execution | single | summary, verification | INVALID | deterministic |
| partial-execution-task-gap | partial_execution | single | complete-task, task-log | INVALID | deterministic |
| declared-memory-degradation | degraded_subsystem | single | health-degraded-mode, memory-truth | CONDITIONAL | deterministic |
| declared-firecrawl-degradation | degraded_subsystem | single | firecrawl, retrieval-posture | CONDITIONAL | deterministic, live |
| undeclared-memory-degradation | degraded_subsystem | single | memory-truth, degraded-state | INVALID | deterministic |
| firecrawl-context-governance-bypass | degraded_subsystem | single | context-build, firecrawl, retrieval-posture, governance | INVALID | deterministic, live |
| memory-truth-contradiction | drift_contradiction | single | memory-truth, drift-report | RECONCILIATION_REQUIRED | deterministic |
| retrieval-truth-posture-downgrade | drift_contradiction | single | firecrawl, retrieval-posture, context-build | INVALID | deterministic, live |
| drift-reconciliation-trigger | drift_contradiction | single | drift-report, reconciliation | RECONCILIATION_REQUIRED | deterministic |
| checkpoint-orphan-block | partial_execution | single | checkpoint, verify-integrity, governance | BLOCK | deterministic |
| mixed-fake-proof-and-drift | fake_verification | mixed | verification, drift-report, phase-truth | INVALID | deterministic |
| mixed-missing-commit-and-undeclared-degradation | missing_commits | mixed | summary, commit-proof, degraded-state | INVALID | deterministic |
| mixed-partial-execution-and-fake-verification | partial_execution | mixed | summary, verification, task-log | INVALID | deterministic |
| mixed-declared-firecrawl-and-undeclared-memory | degraded_subsystem | mixed | firecrawl, memory-truth, degraded-state, retrieval-posture | INVALID | deterministic, live |
| mixed-retrieval-downgrade-and-memory-contradiction | drift_contradiction | mixed | firecrawl, retrieval-posture, memory-truth, drift-report | INVALID | deterministic, live |
| plane-configured-truth-path | degraded_subsystem | single | plane, governance | CONDITIONAL | live |

## Required Surface Coverage

- Authoritative context-build / Firecrawl posture: `firecrawl-context-governance-bypass`, `retrieval-truth-posture-downgrade`, `mixed-declared-firecrawl-and-undeclared-memory`
- Retrieval-facing truth posture: `declared-firecrawl-degradation`, `retrieval-truth-posture-downgrade`, `mixed-retrieval-downgrade-and-memory-contradiction`
- Memory-truth contradictions: `memory-truth-contradiction`, `drift-reconciliation-trigger`, `mixed-retrieval-downgrade-and-memory-contradiction`
- Declared degradation: `declared-memory-degradation`, `declared-firecrawl-degradation`
- Undeclared degradation: `undeclared-memory-degradation`, `mixed-missing-commit-and-undeclared-degradation`, `mixed-declared-firecrawl-and-undeclared-memory`
- Plane-configured path when available: `plane-configured-truth-path`

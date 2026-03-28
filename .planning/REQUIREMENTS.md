# Requirements
#
# Keep requirement entries single-line so audit tooling can parse them
# deterministically without inference.

TRUTH-CLAIM-01: The system MUST treat any state claim without filesystem, git, execution, or deterministic test evidence as INVALID rather than accepted narrative. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-EXEC-01: Every completed task MUST produce at least one git commit that can be mapped to the task scope and reflected in summary evidence. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-VERIFY-01: VERIFICATION.md MUST be evidence-first and include Observable Truths, Requirement Coverage, Anti-Pattern Scan, Drift Analysis, and Final Status sections. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-VERIFY-02: Requirement coverage statuses in verification artifacts MUST be restricted to VALID, CONDITIONAL, or INVALID and each status MUST cite concrete evidence. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-DRIFT-01: The system MUST classify at least Spec Drift, Implementation Drift, Verification Drift, and Execution Drift as first-class inconsistency types. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-DRIFT-02: Detected drift MUST be severity-classified as CRITICAL, MAJOR, or MINOR and mechanically downgrade affected truth statuses instead of remaining narrative-only. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-DEGRADE-01: Degraded subsystems MUST surface explicit health state and alter behavior meaningfully; no silent fallback may present as healthy operation. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-MEMORY-01: Model-facing memory MUST fail closed when canonical trusted memory conditions are unavailable, rather than silently masquerading as trusted planning context. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-BYPASS-01: Critical truth-bearing flows MUST not be bypassable through unsanctioned file writes, skipped validators, or success reporting without proof artifacts. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-OPS-01: Operator surfaces for health, drift, verification, and execution history MUST report actual backend truth rather than optimistic inferred state. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-PHASE-01: Every phase in the milestone MUST produce a structured truth artifact that distinguishes claimed outcomes, observable evidence, gaps or unknowns, and final validity status. | source: .planning/v0.7.0-DECISIONS.md
TRUTH-GAUNTLET-01: The system MUST pass an adversarial end-to-end integrity gauntlet covering missing commits, fake verification, partial execution, degraded subsystems, and drift exposure. | source: .planning/v0.7.0-DECISIONS.md

## Traceability

| Requirement | Final Phase | Status |
|-------------|-------------|--------|
| TRUTH-CLAIM-01 | Phase 70 | Complete |
| TRUTH-EXEC-01 | Phase 71 | Complete |
| TRUTH-VERIFY-01 | Phase 72 | Complete |
| TRUTH-VERIFY-02 | Phase 72 | Complete |
| TRUTH-DRIFT-01 | Phase 70 | Complete |
| TRUTH-DRIFT-02 | Phase 73 | Complete |
| TRUTH-DEGRADE-01 | Phase 75 | Complete |
| TRUTH-MEMORY-01 | Phase 75 | Complete |
| TRUTH-BYPASS-01 | Phase 76 | Complete |
| TRUTH-OPS-01 | Phase 73 | Complete |
| TRUTH-PHASE-01 | Phase 78 | Complete |
| TRUTH-GAUNTLET-01 | Phase 79 | Planned |

# needs-clarification
# None.

# deprecated
# None.

<!-- GSD-AUTHORITY: 70-00-0:4e7d2779ba62731e85ea62477502a495ccf12f0e94993b586fa694a4ccb3ff9b -->

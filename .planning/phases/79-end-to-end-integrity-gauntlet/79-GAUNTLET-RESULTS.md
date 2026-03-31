# Phase 79 Integrity Gauntlet Results

| Scenario | Expected | Actual | Match | Availability |
|----------|----------|--------|-------|--------------|
| fake-verification-forged-verdict | INVALID | INVALID | yes | available |
| fake-verification-missing-truth-table | INVALID | INVALID | yes | available |
| missing-commit-proof-chain | INVALID | INVALID | yes | available |
| missing-proof-index-commit | INVALID | INVALID | yes | available |
| partial-execution-summary-claim | INVALID | INVALID | yes | available |
| partial-execution-task-gap | INVALID | INVALID | yes | available |
| declared-memory-degradation | CONDITIONAL | CONDITIONAL | yes | available |
| declared-firecrawl-degradation | CONDITIONAL | CONDITIONAL | yes | available |
| undeclared-memory-degradation | INVALID | INVALID | yes | available |
| firecrawl-context-governance-bypass | INVALID | INVALID | yes | available |
| memory-truth-contradiction | RECONCILIATION_REQUIRED | RECONCILIATION_REQUIRED | yes | available |
| retrieval-truth-posture-downgrade | INVALID | INVALID | yes | available |
| drift-reconciliation-trigger | RECONCILIATION_REQUIRED | RECONCILIATION_REQUIRED | yes | available |
| checkpoint-orphan-block | BLOCK | BLOCK | yes | available |
| mixed-fake-proof-and-drift | INVALID | INVALID | yes | available |
| mixed-missing-commit-and-undeclared-degradation | INVALID | INVALID | yes | available |
| mixed-partial-execution-and-fake-verification | INVALID | INVALID | yes | available |
| mixed-declared-firecrawl-and-undeclared-memory | INVALID | INVALID | yes | available |
| mixed-retrieval-downgrade-and-memory-contradiction | INVALID | INVALID | yes | available |

## fake-verification-forged-verdict

- Failure class: fake_verification
- Surfaces: verification, phase-truth
- Outcome: INVALID
- Notes: verification artifact validation rejected forged truth
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify verification-artifact /tmp/gsd-gauntlet-fake-verification-forged-verdict-8b5845/.planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md --raw` -> exit 0

## fake-verification-missing-truth-table

- Failure class: fake_verification
- Surfaces: verification
- Outcome: INVALID
- Notes: verification artifact validation rejected forged truth
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify verification-artifact /tmp/gsd-gauntlet-fake-verification-missing-truth-table-uF58N1/.planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md --raw` -> exit 0

## missing-commit-proof-chain

- Failure class: missing_commits
- Surfaces: summary, commit-proof
- Outcome: INVALID
- Notes: summary verification rejected missing commit proof
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify summary /tmp/gsd-gauntlet-missing-commit-proof-chain-4RIiEE/.planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md --raw` -> exit 1

## missing-proof-index-commit

- Failure class: missing_commits
- Surfaces: summary, commit-proof
- Outcome: INVALID
- Notes: summary verification rejected missing commit proof
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify summary /tmp/gsd-gauntlet-missing-proof-index-commit-Y3F2Jl/.planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md --raw` -> exit 1

## partial-execution-summary-claim

- Failure class: partial_execution
- Surfaces: summary, verification
- Outcome: INVALID
- Notes: summary claimed more tasks than its commit proof supports
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify summary /tmp/gsd-gauntlet-partial-execution-summary-claim-TcQB1Z/.planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md --raw` -> exit 1

## partial-execution-task-gap

- Failure class: partial_execution
- Surfaces: complete-task, task-log
- Outcome: INVALID
- Notes: complete-task enforced sequential proof chain
- Artifacts: src/b.js
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs complete-task feat(79-01): skip task one --scope 79-01 --phase 79 --plan 01 --task 2 --files src/b.js --raw` -> exit 1

## declared-memory-degradation

- Failure class: degraded_subsystem
- Surfaces: health-degraded-mode, memory-truth
- Outcome: CONDITIONAL
- Notes: degraded posture was emitted explicitly before truth-bearing continuation
- Artifacts: .planning/health/latest-degraded-state.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw` -> exit 0

## declared-firecrawl-degradation

- Failure class: degraded_subsystem
- Surfaces: firecrawl, retrieval-posture
- Outcome: CONDITIONAL
- Notes: firecrawl availability is surfaced explicitly
- Artifacts: None
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs firecrawl check --raw` -> exit 0

## undeclared-memory-degradation

- Failure class: degraded_subsystem
- Surfaces: memory-truth, degraded-state
- Outcome: INVALID
- Notes: underlying truth is stale but no degraded-state artifact surfaced the condition
- Artifacts: .planning/drift/latest-report.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify integrity --phase 79 --plan 01 --raw` -> exit 1

## firecrawl-context-governance-bypass

- Failure class: degraded_subsystem
- Surfaces: context-build, firecrawl, retrieval-posture, governance
- Outcome: INVALID
- Notes: retrieval posture and context-build behavior are evaluated together
- Artifacts: .planning/drift/latest-report.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs firecrawl check --raw` -> exit 0
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs context build --workflow execute-plan --phase 79 --plan 01 --raw` -> exit 1

## memory-truth-contradiction

- Failure class: drift_contradiction
- Surfaces: memory-truth, drift-report
- Outcome: RECONCILIATION_REQUIRED
- Notes: contradiction is present in authoritative drift reporting
- Artifacts: .planning/drift/latest-report.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw` -> exit 0

## retrieval-truth-posture-downgrade

- Failure class: drift_contradiction
- Surfaces: firecrawl, retrieval-posture, context-build
- Outcome: INVALID
- Notes: retrieval posture claims healthy truth without authoritative backing
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/retrieval-posture.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs firecrawl check --raw` -> exit 0

## drift-reconciliation-trigger

- Failure class: drift_contradiction
- Surfaces: drift-report, reconciliation
- Outcome: RECONCILIATION_REQUIRED
- Notes: contradiction is present in authoritative drift reporting
- Artifacts: .planning/drift/latest-report.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw` -> exit 0

## checkpoint-orphan-block

- Failure class: partial_execution
- Surfaces: checkpoint, verify-integrity, governance
- Outcome: BLOCK
- Notes: orphaned checkpoint prevents trustworthy progression
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/CHECKPOINT.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify integrity --phase 79 --plan 01 --raw` -> exit 0

## mixed-fake-proof-and-drift

- Failure class: fake_verification
- Surfaces: verification, drift-report, phase-truth
- Outcome: INVALID
- Notes: forged verification compounded with drift contradiction
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md, .planning/drift/latest-report.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify verification-artifact /tmp/gsd-gauntlet-mixed-fake-proof-and-drift-3OfTP8/.planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md --raw` -> exit 0
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw` -> exit 0

## mixed-missing-commit-and-undeclared-degradation

- Failure class: missing_commits
- Surfaces: summary, commit-proof, degraded-state
- Outcome: INVALID
- Notes: missing commit proof compounded with undeclared degradation
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify summary /tmp/gsd-gauntlet-mixed-missing-commit-and-undeclared-degradation-hHNItL/.planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md --raw` -> exit 1
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify integrity --phase 79 --plan 01 --raw` -> exit 1

## mixed-partial-execution-and-fake-verification

- Failure class: partial_execution
- Surfaces: summary, verification, task-log
- Outcome: INVALID
- Notes: partial execution compounded with forged verification
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md, .planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify summary /tmp/gsd-gauntlet-mixed-partial-execution-and-fake-verification-pxHD2k/.planning/phases/79-end-to-end-integrity-gauntlet/79-01-SUMMARY.md --raw` -> exit 1
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify verification-artifact /tmp/gsd-gauntlet-mixed-partial-execution-and-fake-verification-pxHD2k/.planning/phases/79-end-to-end-integrity-gauntlet/79-VERIFICATION.md --raw` -> exit 0

## mixed-declared-firecrawl-and-undeclared-memory

- Failure class: degraded_subsystem
- Surfaces: firecrawl, memory-truth, degraded-state, retrieval-posture
- Outcome: INVALID
- Notes: retrieval degradation is explicit while memory degradation remains undeclared
- Artifacts: .planning/drift/latest-report.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs firecrawl check --raw` -> exit 0
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs verify integrity --phase 79 --plan 01 --raw` -> exit 1

## mixed-retrieval-downgrade-and-memory-contradiction

- Failure class: drift_contradiction
- Surfaces: firecrawl, retrieval-posture, memory-truth, drift-report
- Outcome: INVALID
- Notes: retrieval downgrade compounded with memory contradiction
- Artifacts: .planning/phases/79-end-to-end-integrity-gauntlet/retrieval-posture.json, .planning/drift/latest-report.json
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs firecrawl check --raw` -> exit 0
- Command: `node ../../home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs health degraded-mode --raw` -> exit 0

## Capability-Gated Live Coverage

| Scenario | Mode | Availability | Reason |
|----------|------|--------------|--------|
| declared-firecrawl-degradation | live | unavailable | Firecrawl live configuration not present in environment. |
| firecrawl-context-governance-bypass | live | unavailable | Firecrawl live configuration not present in environment. |
| retrieval-truth-posture-downgrade | live | unavailable | Firecrawl live configuration not present in environment. |
| mixed-declared-firecrawl-and-undeclared-memory | live | unavailable | Firecrawl live configuration not present in environment. |
| mixed-retrieval-downgrade-and-memory-contradiction | live | unavailable | Firecrawl live configuration not present in environment. |
| plane-configured-truth-path | live | unavailable | Plane configuration not present in environment. |

<!-- GSD-AUTHORITY: 79-01-3:70c0dafb477a7305df7f1ee393277cf24901ed308ef240b739934de002805ebb -->

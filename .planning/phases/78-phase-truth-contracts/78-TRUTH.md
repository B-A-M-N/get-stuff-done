# Phase 78: Phase Truth Contracts — Truth

**Generated:** 2026-03-28T00:43:07.162Z
**Final Status:** CONDITIONAL

## Status Reasons
- Current degraded truth posture is UNSAFE.
- context:plan-phase blocked by planning_server: planning_server_unavailable
- context:execute-plan blocked by planning_server: planning_server_unavailable
- verify:integrity blocked by drift_truth: drift_truth_stale
- verify:workflow-readiness blocked by drift_truth: drift_truth_stale

## Inputs
- Verification: .planning/phases/78-phase-truth-contracts/78-VERIFICATION.md
- Summaries: .planning/phases/78-phase-truth-contracts/78-01-SUMMARY.md, .planning/phases/78-phase-truth-contracts/78-02-SUMMARY.md
- Drift reports: .planning/drift/latest-report.json
- Reconciliation: .planning/drift/latest-reconciliation.json
- Degraded state: .planning/health/latest-degraded-state.json

## Claimed Outcomes
- Standardize phase-level truth artifacts so every phase reports claimed outcomes, observable evidence, gaps, and final validity status.
- machine-authoritative phase truth derivation contract
- direct `phase-truth generate <phase>` CLI surface
- automatic truth regeneration after verification, reconciliation, and phase completion
- backfilled phase truth artifacts for phases 70 through 77
- current-truth phase status projection across the truth-hardening milestone

## Observable Evidence
- file: .planning/phases/78-phase-truth-contracts/78-01-SUMMARY.md
- file: .planning/phases/78-phase-truth-contracts/78-02-SUMMARY.md
- file: .planning/phases/78-phase-truth-contracts/78-VERIFICATION.md
- command: phase-truth generate 78

## Gaps
- degraded_state_caveat: Current degraded truth posture is UNSAFE.
- workflow_block: context:plan-phase blocked by planning_server: planning_server_unavailable
- workflow_block: context:execute-plan blocked by planning_server: planning_server_unavailable
- workflow_block: verify:integrity blocked by drift_truth: drift_truth_stale
- workflow_block: verify:workflow-readiness blocked by drift_truth: drift_truth_stale

## Drift Effects
- None

## Reconciliation Effects
- None

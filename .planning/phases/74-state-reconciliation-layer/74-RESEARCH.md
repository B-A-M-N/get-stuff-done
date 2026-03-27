---
phase: 74
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 73
    reason: "Phase 74 should consume the Phase 73 drift report and predicted-effect annotations rather than recomputing drift."
  - phase: 72
    reason: "Phase 72 verification artifacts now use evidence-first statuses, which Phase 74 can downgrade deterministically."
---

# Phase 74 Research: State Reconciliation Layer

## Summary

Phase 74 should be implemented as a deterministic reconciliation layer that consumes the Phase 73 runtime drift report and applies status consequences through sanctioned interfaces.

The repo already has:
- mutable planning truth surfaces in [`state.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs) and [`roadmap.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/roadmap.cjs)
- evidence-first verification semantics from Phase 72
- a clear milestone requirement that drift must downgrade truth mechanically rather than remain narrative-only

What is missing is:
- a reconciliation rule engine
- a sanctioned CLI path for applying reconciliation
- a machine-readable record of applied downgrade decisions and re-verification requirements
- focused tests proving that active drift mutates status truth deterministically while historical drift does not

Primary recommendation:
- add `get-stuff-done/bin/lib/drift-reconcile.cjs` as a pure rule evaluator plus application orchestrator
- add `get-stuff-done/bin/lib/drift-reconcile-adapter.cjs` as the mandatory thin normalization layer between the Phase 73 report and reconciliation rules
- consume Phase 73 report fields `affected` and `predicted_effect` directly
- mutate only through sanctioned surfaces in `state.cjs`, `roadmap.cjs`, and adjacent truth modules
- persist one reconciliation artifact that records source report, applied consequences, and re-verification requirements
- keep repair planning out of scope

## Current Reality

### Existing usable primitives

- [`get-stuff-done/bin/lib/state.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/state.cjs)
  - already owns sanctioned mutations for `STATE.md`
  - already has field-level update and patch helpers
  - is the natural place to apply state-surface downgrade rather than editing `STATE.md` manually
- [`get-stuff-done/bin/lib/roadmap.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/roadmap.cjs)
  - already updates roadmap progress and phase status surfaces
  - can be extended to accept deterministic downgrade input
- [`get-stuff-done/bin/lib/verify.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/verify.cjs)
  - already reasons about verification truth, integrity, and evidence
  - should remain a consumer of reconciliation outcomes, not the place where reconciliation rules are invented ad hoc
- Phase 72 verification contract
  - already constrains statuses to `VALID | CONDITIONAL | INVALID`
  - gives Phase 74 a clean target vocabulary for downgrade

### Missing pieces

- no `drift-reconcile.cjs`
- no `drift-reconcile-adapter.cjs`
- no sanctioned `drift reconcile` CLI path
- no sanctioned `drift preview` dry-run path
- no reconciliation artifact
- no machine-readable re-verification requirement surface
- no focused downgrade/reconciliation test suite

## Standard Stack

- Node.js stdlib only
- existing sanctioned mutation helpers in:
  - `state.cjs`
  - `roadmap.cjs`
  - possibly verification helper modules if needed
- Node test runner for focused reconciliation tests

No new dependency appears warranted. This is deterministic state mutation logic, not infrastructure work.

## Architecture Patterns

### 1. Pure rule evaluation before mutation

Recommended split:
- `adaptDriftReport(report)` returns a reconciliation-ready normalized input
- `evaluateReconciliation(normalized, options)` returns a pure decision object
- `applyReconciliation(decision, cwd)` performs sanctioned mutations

This keeps the downgrade matrix testable and prevents mutation logic from becoming opaque.

### 2. Report-driven reconciliation

Recommended input contract:
- Phase 74 does not detect drift itself
- it trusts the Phase 73 report as current drift input
- it consumes Phase 73 output only through a thin adapter layer
- the adapter normalizes:
  - severity
  - type
  - `affected`
  - `predicted_effect`
  - target identifiers
  - evidence references

If the Phase 73 report is missing those fields, fix the adapter or upstream report contract rather than broadening Phase 74 into a second scanner.

### 3. Central reconciliation artifact

Recommended runtime artifact:
- `.planning/drift/latest-reconciliation.json`

Suggested contents:
- source report hash/path
- source report timestamp
- applied at timestamp
- mutated surfaces
- unchanged surfaces
- re-verification requirements
- historical findings ignored for current downgrade
- summary counts by severity

This provides an audit trail without forcing reconciliation details into every downstream artifact immediately.

### 4. Status mutation should be narrow and attributable

Recommended first targets:
- operator health degradation state
- current phase/state truth markers
- explicit re-verification-required markers for affected verification/phase claims

Avoid broad uncontrolled rewrites of past summaries or verification artifacts in this phase. The mutation scope is locked to `STATE.md`, phase metadata markers, operator health markers, and machine-readable re-verification markers; it must not rewrite roadmap structure, requirements, historical artifacts, or code.

### 5. Fixed downgrade matrix

The downgrade matrix is no longer an implementation choice:

- `CRITICAL`
  - `verification_status -> INVALID`
  - `phase_status -> INVALID`
  - `roadmap_status -> BLOCKED`
  - `operator_health -> UNHEALTHY`
- `MAJOR`
  - `verification_status -> CONDITIONAL`
  - `phase_status -> CONDITIONAL`
  - `roadmap_status -> AT_RISK`
  - `operator_health -> DEGRADED`
- `MINOR`
  - `verification_status -> VALID`
  - `phase_status -> VALID`
  - `roadmap_status -> INFO`
  - `operator_health -> HEALTHY_WITH_WARNINGS`

Worst severity wins per surface.

## Recommended Scope

### Required

- implement `drift-reconcile.cjs`
- implement `drift-reconcile-adapter.cjs`
- consume the Phase 73 report through the adapter
- apply deterministic downgrade rules for active drift by severity
- record machine-readable re-verification requirements
- add sanctioned `drift preview` and `drift reconcile` routes
- add focused tests for:
  - critical invalidation
  - major conditional downgrade
  - historical non-blocking behavior
  - reconciliation attribution to the source report

### Strongly recommended

- persist a central reconciliation artifact
- include source report identity and hash in applied output
- include `from`, `to`, `reason`, and evidence reference in every applied mutation
- avoid mutating historical completed artifacts unless the milestone contract explicitly requires it
- keep downgrade matrices explicit in code rather than implicit in procedural branches

### Out of scope

- fixing the drift itself
- generating repair plans
- retroactively rewriting all prior phase artifacts
- introducing broad policy engines or workflow orchestration here

## Common Pitfalls

- recomputing drift instead of reconciling reported drift
  - that duplicates Phase 73 and creates competing truths
- letting reconciliation rules depend directly on raw Phase 73 report shape
  - that couples mutation logic to scanner internals and guarantees future drift
- mutating too many surfaces at once
  - reconciliation should be narrow, attributable, and testable
- inventing evidence during downgrade
  - reconciliation applies consequences only
- failing to record why re-verification is now required
  - that makes the downgrade non-actionable
- treating historical drift as active
  - Phase 70 already established that historical drift is visible but non-blocking

## Open Questions / Assumptions

- Assumption: Phase 74 uses the Phase 73 report’s `affected` and `predicted_effect` data as inputs rather than recomputing its own detection layer.
- Assumption: the adapter remains thin and translation-only; if Phase 73 report shape changes, update the adapter rather than broadening reconciliation back into a second detection engine.
- Assumption: the canonical mutation command is `drift reconcile`, while `drift preview` remains dry-run only.

## Don't Hand-Roll

- do not hand-roll direct file rewrites of `STATE.md` or `ROADMAP.md` outside existing sanctioned helpers
- do not hand-roll a second status vocabulary beyond `VALID | CONDITIONAL | INVALID` plus explicit degraded/reverification flags
- do not build a generic remediation framework in this phase
- do not recompute drift from scratch inside reconciliation

## Code Examples

### Recommended reconciliation split

```javascript
function adaptDriftReport(report) {
  return {
    source_report: report.meta,
    normalized_drift: report.findings.map((finding) => ({
      severity: finding.severity,
      affected: finding.affected,
      predicted_effect: finding.predicted_effect
    }))
  };
}

function evaluateReconciliation(normalized) {
  return {
    source_report: normalized.source_report,
    applied: [
      {
        surface: 'verification',
        target: 'current_phase',
        new_status: 'INVALID',
        reason: 'critical_execution_drift'
      }
    ],
    reverification_required: [
      {
        phase: '72',
        reason: 'critical drift invalidated prior verified truth'
      }
    ]
  };
}

function applyReconciliation(cwd, decision) {
  // route through state/roadmap sanctioned helpers
}
```

### Recommended downgrade heuristics

- `CRITICAL` active drift
  - invalidate affected verification or phase truth
  - set roadmap/operator surfaces to `BLOCKED` and `UNHEALTHY`
  - require re-verification
- `MAJOR` active drift
  - mark conditional plus `AT_RISK` / `DEGRADED`
  - require explicit repair or re-verification before closure
- `MINOR` active drift
  - preserve valid verification and phase truth while surfacing `INFO` and `HEALTHY_WITH_WARNINGS`
- historical-only drift
  - record, but no current downgrade

## Bottom Line

Phase 74 should be a deterministic consequence engine, not another scanner.

The clean implementation shape is:
- one pure reconciliation rule layer
- one sanctioned mutation path
- one machine-readable applied-output artifact
- explicit re-verification requirements

That keeps the phase aligned with the milestone thesis: the system must stop reporting healthy truth when drift has already proven otherwise.

<!-- GSD-AUTHORITY: 74-00-0:1a8001de6c1b2f87885c80a287b06e4884c43987cce182e43691ec505b4e72b1 -->

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
- no sanctioned `drift reconcile` CLI path
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
- `evaluateReconciliation(report, options)` returns a pure decision object
- `applyReconciliation(decision, cwd)` performs sanctioned mutations

This keeps the downgrade matrix testable and prevents mutation logic from becoming opaque.

### 2. Report-driven reconciliation

Recommended input contract:
- Phase 74 does not detect drift itself
- it trusts the Phase 73 report as current drift input
- it consumes:
  - severity
  - type
  - `affected`
  - `predicted_effect`

If the Phase 73 report is missing those fields, fix the adapter or upstream report contract rather than broadening Phase 74 into a second scanner.

### 3. Central reconciliation artifact

Recommended runtime artifact:
- `.planning/drift/latest-reconciliation.json`

Suggested contents:
- source report hash/path
- applied at timestamp
- mutated surfaces
- unchanged surfaces
- re-verification requirements
- historical findings ignored for current downgrade

This provides an audit trail without forcing reconciliation details into every downstream artifact immediately.

### 4. Status mutation should be narrow and attributable

Recommended first targets:
- operator health degradation state
- current phase/state truth markers
- explicit re-verification-required markers for affected verification/phase claims

Avoid broad uncontrolled rewrites of past summaries or verification artifacts in this phase.

## Recommended Scope

### Required

- implement `drift-reconcile.cjs`
- consume the Phase 73 report directly
- apply deterministic downgrade rules for active drift by severity
- record machine-readable re-verification requirements
- add a sanctioned CLI route for reconciliation
- add focused tests for:
  - critical invalidation
  - major conditional downgrade
  - historical non-blocking behavior
  - reconciliation attribution to the source report

### Strongly recommended

- persist a central reconciliation artifact
- include source report identity and hash in applied output
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
- Guidance: if an adapter is needed between the Phase 73 report and Phase 74 reconciliation input, keep that adapter narrow and do not broaden reconciliation back into a second detection engine.
- Open question: whether reconciliation writes one central artifact plus targeted status updates, or a small family of artifacts, should remain an implementation choice as long as the applied downgrade path is machine-readable and attributable to the source report.

## Don't Hand-Roll

- do not hand-roll direct file rewrites of `STATE.md` or `ROADMAP.md` outside existing sanctioned helpers
- do not hand-roll a second status vocabulary beyond `VALID | CONDITIONAL | INVALID` plus explicit degraded/reverification flags
- do not build a generic remediation framework in this phase
- do not recompute drift from scratch inside reconciliation

## Code Examples

### Recommended reconciliation split

```javascript
function evaluateReconciliation(report) {
  return {
    source_report: report.meta,
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
  - degrade operator truth
  - require re-verification
- `MAJOR` active drift
  - mark conditional/degraded
  - require explicit repair or re-verification before closure
- `MINOR` active drift
  - annotate but do not necessarily invalidate
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

<!-- GSD-AUTHORITY: 74-00-0:19748625467c1b56e5ba535e0534bdb4ea299ffda31a6bb54e0d3670b3c4e3b5 -->

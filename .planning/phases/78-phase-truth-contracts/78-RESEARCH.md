---
phase: 78
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 71
    reason: "Phase truth must consume execution proof-chain outputs rather than invent a second execution-evidence model."
  - phase: 72
    reason: "Phase verification remains the requirement/evidence proof surface that phase truth synthesizes."
  - phase: 73
    reason: "Current drift findings provide contradiction inputs that can downgrade phase truth."
  - phase: 74
    reason: "Applied reconciliation is the strongest derivation input for final phase validity."
  - phase: 75
    reason: "Degraded truth posture can limit certainty even when local evidence looks otherwise valid."
---

# Phase 78 Research: Phase Truth Contracts

## Summary

Phase 78 should add one generated, machine-authoritative truth artifact per phase and one rendered markdown companion. The new contract must synthesize existing proof, verification, drift, reconciliation, and degraded-state inputs into a single phase-local validity record without duplicating raw evidence or re-implementing verification logic.

Primary recommendation:
- add a dedicated `phase-truth` helper module for artifact discovery, derivation, rendering, and validation
- wire `gsd:phase-truth generate <phase>` as the explicit generation surface
- keep YAML authoritative and markdown rendered from it
- backfill phases `70` through `77` using tolerant derivation rules that surface explicit gaps instead of guessing

This phase should not redesign `SUMMARY.md`, `VERIFICATION.md`, or `VALIDATION.md`. It should layer a synthesis shell above them.

## Current Reality

### Existing usable primitives

- `get-stuff-done/bin/lib/phase.cjs`
  - already finds phase directories and enumerates plans and summaries
  - is the correct starting point for per-phase source discovery
- `get-stuff-done/bin/lib/verify.cjs`
  - already enforces `VALID | CONDITIONAL | INVALID`
  - already parses structured verification sections and drift blocks
  - should remain the authoritative verification contract owner
- `get-stuff-done/bin/lib/drift-reconcile.cjs`
  - already writes `.planning/drift/latest-reconciliation.json`
  - already owns the canonical downgrade matrix
- `get-stuff-done/bin/lib/degraded-mode.cjs`
  - already writes `.planning/health/latest-degraded-state.json`
  - already expresses when truth-bearing interpretation is limited or unsafe
- completed phase artifacts under `.planning/phases/70-*` through `.planning/phases/77-*`
  - already provide the recent truth-hardening scope that Phase 78 should backfill

### Missing pieces

- no per-phase truth artifact exists yet
- no canonical derivation engine composes verification, reconciliation, drift, and degraded posture into one phase-local result
- no validator exists for the new artifact family
- no explicit command exists to regenerate truth after reconciliation or phase completion
- no tolerant backfill process exists for phases 70-77

## Standard Stack

- Node.js stdlib only
- existing helpers:
  - `phase.cjs`
  - `verify.cjs`
  - `drift-engine.cjs`
  - `drift-reconcile.cjs`
  - `degraded-mode.cjs`
  - `frontmatter.cjs`
  - `core.cjs`
- YAML primary artifact
- markdown rendered companion
- Node test runner for derivation, validation, and CLI wiring

No new dependency is justified. This phase is contract synthesis and validation, not a new platform layer.

## Architecture Patterns

### 1. Generated machine contract plus rendered markdown view

Recommended structure:
- `get-stuff-done/bin/lib/phase-truth.cjs`
- `.planning/phases/<N>-<slug>/<N>-TRUTH.yaml`
- `.planning/phases/<N>-<slug>/<N>-TRUTH.md`

Recommended behavior:
- derive one canonical machine object
- persist YAML
- render markdown from the same object
- never treat markdown as a source input for final status

This keeps authoritative truth deterministic while preserving operator readability.

### 2. Synthesis shell, not second verifier

Recommended ownership split:
- `SUMMARY.md` owns execution-history and proof-chain references
- `VERIFICATION.md` owns requirement/evidence verification
- drift artifacts own contradiction detection
- reconciliation owns downgrade application
- degraded-state owns truth posture caveats
- phase truth owns final per-phase synthesis

This avoids duplicating raw evidence and keeps each artifact family single-purpose.

### 3. Deterministic precedence over best-effort aggregation

Recommended derivation order:
1. applied reconciliation affecting the phase
2. active drift findings affecting the phase
3. phase verification artifact
4. plan summaries and proof-chain evidence
5. degraded-state caveats affecting interpretation

Recommended consequence model:
- any invalidating reconciliation, invalid verification, unresolved critical drift, broken required proof chain, or missing required truth-bearing evidence => `INVALID`
- otherwise unresolved gap, escalation, degraded caveat, or unresolved major drift => `CONDITIONAL`
- only fully backed and caveat-free phases => `VALID`

This matches the milestone truth-hardening posture: contradictions and applied downgrades override optimistic local summaries.

### 4. Explicit source references, minimal evidence duplication

Recommended artifact content:
- list the source artifacts used
- summarize claimed outcomes
- capture phase-local gaps
- record drift and reconciliation effects
- record final status and reasons

Recommended anti-duplication rule:
- include references to lower-level artifacts instead of copying full tables or proof blocks into the new artifact

This keeps the new contract compositional rather than sprawling.

### 5. Tolerant backfill, strict forward enforcement

Recommended backfill behavior for phases 70-77:
- discover whatever structured inputs exist
- if a source is missing or too legacy-shaped, emit a gap entry
- never fabricate certainty

Recommended forward behavior for new phases:
- require the full contract and validator pass

This preserves milestone continuity without turning backfill into fake normalization.

## Recommended Scope

### Required

- add a dedicated phase-truth helper module
- define the authoritative YAML contract and markdown renderer
- implement deterministic derivation from summaries, verification, drift, reconciliation, and degraded-state sources
- add a validator for schema shape and derivation semantics
- add `gsd:phase-truth generate <phase>`
- support limited backfill for phases 70-77
- add focused tests for:
  - valid derivation
  - conditional derivation from gaps or degraded caveats
  - invalid derivation from reconciliation, drift, or missing required proof
  - backfill tolerance for missing historical inputs
  - CLI generation and artifact persistence

### Strongly recommended

- keep source references explicit under an `inputs` block
- centralize phase-affecting drift and reconciliation filtering in one helper
- generate markdown from the machine object rather than maintaining two hand-authored templates
- make update-trigger helpers reusable by verification and reconciliation flows

### Out of scope

- redesigning verification artifact format
- redesigning summary artifact format
- full historical retrofit outside phases 70-77
- milestone-level truth aggregation
- artifact signing
- full adversarial gauntlet testing

## Common Pitfalls

- letting phase truth become a second verification engine
  - this would reintroduce duplicate truth semantics
- treating markdown as authoritative
  - that collapses back into narrative truth
- deriving phase status from summaries alone
  - summaries are evidence references, not final truth authority
- ignoring applied reconciliation because local artifacts look healthy
  - this would make phase truth stale and contradictory
- backfilling legacy phases as if missing inputs were proven valid
  - missing historical structure must surface as gaps, not inferred success
- mixing milestone-wide aggregation into the first phase-truth contract
  - this would widen scope and complicate derivation immediately

## Open Questions / Assumptions

- Assumption: one plan is enough if it explicitly separates contract/derivation, wiring, and backfill in the task breakdown.
- Assumption: affected-phase filtering for drift and reconciliation can be implemented from existing artifact fields without changing those upstream formats in Phase 78.
- Assumption: YAML generation can stay dependency-free by emitting a constrained shape with existing repo patterns or a small local serializer.
- Open question worth resolving in implementation: whether markdown rendering should include optional operator notes, and if so, how to keep that section clearly non-authoritative.

## Don't Hand-Roll

- do not invent a new evidence taxonomy parallel to verification
- do not recompute a second downgrade matrix instead of consuming reconciliation
- do not silently skip missing legacy inputs during backfill
- do not make `TRUTH.md` writable source truth
- do not wire generation only as hidden automation without a direct command surface

## Code Examples

### Recommended derivation shell

```javascript
function derivePhaseTruth(inputs) {
  const result = {
    phase: inputs.phase,
    inputs: inputs.refs,
    claimed_outcomes: collectClaimedOutcomes(inputs),
    observable_evidence: collectEvidenceRefs(inputs),
    gaps: collectTruthGaps(inputs),
    drift_effects: collectDriftEffects(inputs),
    reconciliation_effects: collectReconciliationEffects(inputs),
  };
  result.final_status = deriveFinalStatus(result, inputs);
  result.status_reason = deriveStatusReasons(result, inputs);
  return result;
}
```

### Recommended CLI contract

```javascript
phaseTruth.generate(cwd, phase, { backfill: true, write: true });
```

### Recommended forward/backfill split

```javascript
const strict = comparePhaseNum(phaseNumber, '78') >= 0;
const truth = derivePhaseTruth({ phaseNumber, strict });
validatePhaseTruth(truth, { strict });
```

## Bottom Line

Phase 78 should make phase truth first-class by adding one machine-authoritative phase artifact and one operator-facing rendered companion, both generated from the existing truth stack. The key is not more evidence generation. The key is deterministic synthesis with explicit gaps, current downgrade awareness, and a reusable command/validator surface that future phases and closeout flows can trust.

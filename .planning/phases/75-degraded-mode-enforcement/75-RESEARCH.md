---
phase: 75
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 74
    reason: "Phase 75 must consume applied reconciliation truth and current drift freshness rather than inventing a second policy history."
  - phase: 54
    reason: "Phase 54 already established model-facing memory fail-closed behavior around Postgres-backed truth and should be extended rather than replaced."
---

# Phase 75 Research: Degraded Mode Enforcement

## Summary

Phase 75 should be implemented as a narrow degraded-policy layer that consumes live subsystem health plus the latest drift and reconciliation artifacts, normalizes them into a canonical `HEALTHY | DEGRADED | UNSAFE` model, and enforces fail-closed behavior on truth-bearing workflows.

The repo already has most low-level pieces:
- backend truth in [`brain-manager.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/brain-manager.cjs)
- model-facing memory fail-closed guards in [`second-brain.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs)
- drift visibility from Phase 73 in `.planning/drift/latest-report.json`
- reconciliation truth from Phase 74 in `.planning/drift/latest-reconciliation.json`
- a basic degraded-mode reader surface in [`commands.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/commands.cjs)

What is missing is:
- one canonical degraded-state artifact
- one policy normalizer that maps raw subsystem conditions to `HEALTHY | DEGRADED | UNSAFE`
- consistent freshness handling for drift and reconciliation truth
- top-level CLI enforcement on truth-bearing commands
- subsystem-level safety backstops for unsafe model-facing memory and stale truth posture

Primary recommendation:
- add `get-stuff-done/bin/lib/degraded-mode.cjs` as the canonical policy evaluator and artifact writer
- persist `.planning/health/latest-degraded-state.json`
- have `brain health --raw` and `health degraded-mode` read the same policy snapshot
- extend top-level routes in [`gsd-tools.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/gsd-tools.cjs) to block truth-bearing commands early when degraded policy says `UNSAFE`
- keep `second-brain.cjs` as the subsystem fail-closed backstop for model-facing memory

## Current Reality

### Existing usable primitives

- [`get-stuff-done/bin/lib/brain-manager.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/brain-manager.cjs)
  - already reports backend truth for Postgres, RabbitMQ, Planning Server, model-facing memory, and drift health
  - currently mixes raw status vocabulary such as `ok`, `blocked`, `error`, and `disconnected`
  - is the natural input layer for canonical degraded-state normalization
- [`get-stuff-done/bin/lib/second-brain.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/second-brain.cjs)
  - already enforces `requirePostgres()` for model-facing memory reads and writes
  - returns `postgres_required` in writeback paths instead of silently pretending success
  - is the correct subsystem-level backstop for truth-bearing memory flows
- [`get-stuff-done/bin/lib/commands.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/commands.cjs)
  - already exposes `health degraded-mode`
  - currently only checks coarse planning/config fallback state, not the full Phase 75 truth-bearing policy
- [`get-stuff-done/bin/lib/verify.cjs`](/home/bamn/get-stuff-done/get-stuff-done/bin/lib/verify.cjs)
  - already owns truth-bearing verification and integrity commands
  - is a natural CLI-level enforcement point for stale or unsafe truth posture
- Phase 73 and 74 runtime artifacts
  - already provide current drift observation and applied reconciliation history
  - are the right freshness inputs for degraded-mode policy

### Missing pieces

- no canonical degraded-state artifact
- no `degraded-mode.cjs` policy evaluator
- no explicit normalization layer from raw subsystem statuses to `HEALTHY | DEGRADED | UNSAFE`
- no freshness policy for latest drift/reconciliation truth
- no structured blocked-flow response contract reused across truth-bearing commands
- no focused tests for stale-truth enforcement

## Standard Stack

- Node.js stdlib only
- existing internal health and truth helpers:
  - `brain-manager.cjs`
  - `second-brain.cjs`
  - `drift-engine.cjs`
  - `drift-reconcile.cjs`
  - `commands.cjs`
  - `verify.cjs`
- Node test runner for deterministic policy and CLI enforcement tests

No new dependency is justified. This phase is policy wiring and enforcement, not infrastructure expansion.

## Architecture Patterns

### 1. One canonical policy snapshot

Recommended structure:
- `buildDegradedState(cwd, options)` returns the canonical machine object
- `writeLatestDegradedState(cwd, snapshot)` persists `.planning/health/latest-degraded-state.json`
- reader surfaces consume that snapshot rather than infer degraded posture independently

This keeps `brain health --raw`, `health degraded-mode`, and blocking routes aligned.

### 2. Normalize raw truth before enforcing

Recommended model:
- raw health remains detailed and local
- degraded policy normalizes those details into:
  - subsystem state
  - aggregate truth-bearing state
  - blocked workflows
  - warning-only workflows

That avoids leaking low-level labels like `blocked`, `error`, or `UNHEALTHY` directly into policy vocabulary.

### 3. Live health wins, artifacts provide freshness and audit context

Recommended enforcement order:
- live subsystem truth determines current operability
- latest drift and reconciliation artifacts determine whether truth posture is fresh enough to trust
- stale or missing artifacts can independently push a truth-bearing workflow to `UNSAFE`

This matches the locked rule that live health wins for current enforcement while reconciliation remains history.

### 4. Both CLI and subsystem backstops are required

Recommended split:
- CLI route gates provide:
  - early block
  - plain-English reason
  - implications
  - next options
- subsystem helpers provide:
  - hard fail-closed behavior even if a top-level route forgets to gate

This is especially important for model-facing memory and verification flows.

### 5. Two-plan execution split is still correct

Recommended Phase 75 split:
- `75-01`
  - canonical degraded-state model
  - artifact generation
  - operator and health reader surfaces
  - freshness and blocked-workflow policy
- `75-02`
  - truth-bearing memory and verification fail-closed enforcement
  - CLI route gating
  - structured blocked-flow outputs

## Recommended Scope

### Required

- add `get-stuff-done/bin/lib/degraded-mode.cjs`
  - normalize raw subsystem truth
  - read drift/reconciliation freshness
  - compute aggregate `HEALTHY | DEGRADED | UNSAFE`
  - record blocked workflows and warnings
  - write `.planning/health/latest-degraded-state.json`
- extend `brain-manager.cjs`
  - expose canonical degraded-state output
  - keep raw backend diagnostics available for drill-down
- extend `commands.cjs`
  - upgrade `health degraded-mode` to read the canonical degraded-state snapshot
- add top-level enforcement for truth-bearing routes in `gsd-tools.cjs`
- extend subsystem fail-closed checks where needed in `second-brain.cjs` and verification paths
- add focused tests for:
  - state normalization
  - stale drift/reconciliation truth
  - blocked truth-bearing routes
  - model-facing memory fail-closed policy

### Strongly recommended

- use one structured blocked-flow response shape everywhere
- include source timestamps and freshness reasons in the degraded-state artifact
- treat missing artifact files explicitly, not as implicit “healthy”
- keep diagnostic/status commands runnable even under `UNSAFE`

### Out of scope

- bypass auditing of every file-write path
- broad code or roadmap mutation beyond sanctioned degraded-state artifacts and health surfaces
- end-to-end adversarial gauntlet coverage

## Common Pitfalls

- leaving `UNHEALTHY` as a second policy vocabulary
  - Phase 75 must collapse policy state to `HEALTHY | DEGRADED | UNSAFE`
- letting `brain health` and `health degraded-mode` compute different truths
  - both should read one canonical degraded snapshot
- treating stale drift/reconciliation state as informational only
  - the locked rule says stale truth can become `UNSAFE` for truth-bearing flows
- allowing planning to continue on partial trust
  - planning must be memory-backed and trustworthy or memory-disabled
- relying only on top-level CLI enforcement
  - subsystem helpers must still fail closed

## Open Questions / Assumptions

- Assumption: `.planning/health/latest-degraded-state.json` is the cleanest canonical artifact path because it separates policy truth from drift observation and reconciliation history.
- Assumption: `brain health --raw` remains the canonical machine-readable reader surface, but it should read or embed the same degraded snapshot that `health degraded-mode` reports.
- Open question: whether verification gating should live directly inside `verify.cjs`, `gsd-tools.cjs`, or both can remain implementation-flexible as long as both top-level and subsystem-level enforcement are present by phase closeout.

## Don't Hand-Roll

- do not hand-roll multiple degraded-state vocabularies
- do not let every command infer its own stale-truth policy
- do not weaken `requirePostgres()` into a warning-only path for planning flows
- do not treat missing drift or reconciliation artifacts as implicitly healthy
- do not block diagnostic commands that are required to inspect an unsafe system

## Code Examples

### Recommended policy evaluator split

```javascript
function buildDegradedState(cwd, options = {}) {
  const liveHealth = collectLiveHealth(cwd, options);
  const freshness = readTruthFreshness(cwd, options);
  const subsystems = normalizeSubsystemStates(liveHealth, freshness);
  return aggregatePolicyState(subsystems, options);
}

function enforceWorkflow(snapshot, workflow) {
  if (snapshot.blocked_workflows.includes(workflow)) {
    return {
      allowed: false,
      state: 'UNSAFE',
      reason: snapshot.reasons[workflow],
    };
  }
  return { allowed: true, state: snapshot.aggregate_state };
}
```

### Recommended blocked-flow shape

```json
{
  "allowed": false,
  "subsystem": "model_facing_memory",
  "canonical_state": "UNSAFE",
  "reason": "canonical Postgres-backed memory unavailable",
  "implications": [
    "planner context cannot be treated as trusted",
    "truth-bearing memory-backed workflow blocked"
  ],
  "next_options": [
    "restore Postgres-backed memory",
    "run diagnostic health surfaces only"
  ]
}
```

## Bottom Line

Phase 75 should not invent a new monitoring system. It should codify existing health and drift truth into one degraded-policy snapshot and make truth-bearing workflows obey it.

The right implementation shape is:
- one canonical degraded-state artifact
- one normalization layer
- one shared reader truth across health surfaces
- top-level and subsystem fail-closed enforcement
- no silent continuation on stale or untrusted truth

<!-- GSD-AUTHORITY: 75-00-0:367854635c647845775390ae48eaf3fe4ab780cf16f37391ad42cd401e9eaa88 -->

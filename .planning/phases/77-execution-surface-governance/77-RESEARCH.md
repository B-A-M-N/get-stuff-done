---
phase: 77
status: researched
researched: 2026-03-27
updated: 2026-03-27
depends_on:
  - phase: 75
    reason: "Phase 77 reuses the degraded-state artifact and fail-closed subsystem boundaries from Phase 75."
  - phase: 76
    reason: "Phase 76 boundary auditing defines the critical truth-bearing surfaces that Phase 77 should classify and narrow."
---

# Phase 77 Research: Execution Surface Governance

## Summary

Phase 77 should turn the Phase 75 safety model into a usable command-governance layer by centralizing command classification, narrowing top-level blocking to authoritative truth transitions, and preserving universal subsystem fail-closed safety.

The repo already has the hard part:
- canonical degraded truth in `.planning/health/latest-degraded-state.json`
- top-level blocking hooks in `gsd-tools.cjs`
- subsystem backstops in memory and verification surfaces

What it does not yet have is:
- one canonical command governance map
- one deterministic lookup layer from command route to governance class
- a clean split between ungated execution, warn-only execution, hard-gated truth transitions, and recovery-only repair paths

Primary recommendation:
- add `.planning/policy/command-governance.yaml` as the governance source of truth
- add a small governance helper in the CLI layer to classify `(command + subcommand + mode)`
- keep Phase 75 degraded-state evaluation as the policy input
- narrow CLI blocking behavior based on governance class while leaving subsystem fail-closed checks intact

## Current Reality

### Existing usable primitives

- `get-stuff-done/bin/lib/degraded-mode.cjs`
  - already computes aggregate truth posture and blocked workflow decisions
  - is the correct current-truth input for governance
- `get-stuff-done/bin/gsd-tools.cjs`
  - already holds top-level CLI dispatch and Phase 75 route blocking
  - is the natural place to apply command classification before route execution
- `get-stuff-done/bin/lib/context.cjs`
  - already distinguishes planning workflows such as `plan-phase` and `execute-plan`
  - shows that subcommand or mode classification is already semantically meaningful
- `get-stuff-done/bin/lib/verify.cjs`
  - already owns commands that assert current truth posture
  - should stay hard-gated for authoritative verification claims
- `get-stuff-done/bin/lib/commands.cjs`
  - already exposes operator diagnostics and health surfaces that should remain available

### Missing pieces

- no central command governance policy file
- no canonical map from command route to governance class
- no warn-only output contract shared across top-level commands
- no explicit default policy for newly added commands
- no tests proving non-authoritative execution remains runnable while truth transitions still block

## Standard Stack

- Node.js stdlib only
- existing CLI and policy helpers:
  - `degraded-mode.cjs`
  - `gsd-tools.cjs`
  - `context.cjs`
  - `verify.cjs`
  - `commands.cjs`
- YAML artifact in `.planning/policy/command-governance.yaml`
- Node test runner for route classification and governance behavior

No new dependency is justified. This phase is policy centralization and CLI consequence shaping.

## Architecture Patterns

### 1. One canonical governance map

Recommended structure:
- `.planning/policy/command-governance.yaml`
- keys classify `(command + subcommand + mode)` into:
  - `ungated_execution`
  - `warn_only`
  - `hard_gated_state_transition`
  - `recovery_only`

This prevents governance drift across CLI routes.

### 2. Policy input stays singular

Recommended model:
- Phase 75 degraded-state artifact remains the only current-truth input
- Phase 77 adds policy consequence logic, not a second health or governance artifact

This avoids truth duplication.

### 3. CLI narrowing, subsystem safety retention

Recommended split:
- CLI layer decides:
  - allow
  - allow with warning
  - block
  - always allow for recovery
- subsystem helpers still fail closed internally when truth-bearing operations are actually unsafe

This is the core usability pattern for Phase 77.

### 4. Per-route classification, not broad command-family assumptions

Recommended classifier key:
- command
- subcommand
- workflow or mode when applicable

This is necessary because `context build --workflow plan-phase` and a future scratch context build should not have identical governance.

### 5. Warnings must remain explicit

Recommended behavior:
- `warn_only` commands emit warnings every invocation
- raw mode returns structured warning payloads
- warnings explain degraded dependency and implication without blocking work

This preserves flow without hiding degraded posture.

## Recommended Scope

### Required

- add `.planning/policy/command-governance.yaml`
- add governance helper module or extend `degraded-mode.cjs` with command classification lookup
- wire `gsd-tools.cjs` to consult governance class before applying Phase 75 blocking behavior
- keep `context.cjs` and `verify.cjs` hard-gated where they finalize or assert truth
- ensure `brain health`, `drift status`, `drift scan`, `drift preview`, and related inspection/repair flows remain runnable
- add focused tests for:
  - governance classification lookup
  - warn-only command warnings
  - hard-gated truth transitions still blocking under `UNSAFE`
  - recovery-only command availability under `UNSAFE`

### Strongly recommended

- keep default governance for new commands at `warn_only`
- include policy comments or schema guidance near the YAML map
- make warning payloads machine-readable in raw mode
- keep policy map readable enough for operators to reason about

### Out of scope

- changing subsystem fail-closed semantics established in Phase 75
- adding new health artifacts
- broad roadmap or phase artifact redesign
- full adversarial gauntlet testing

## Common Pitfalls

- re-embedding governance decisions in scattered `if` branches
  - this recreates the Phase 75 sprawl problem
- weakening subsystem backstops
  - Phase 77 should narrow CLI friction, not weaken underlying truth safety
- classifying top-level families instead of specific routes
  - this causes over-blocking and under-blocking at the same time
- defaulting new commands to ungated
  - that would silently widen truth risk
- treating recovery commands like normal execution
  - repair must stay available even when truth is unsafe

## Open Questions / Assumptions

- Assumption: a YAML policy map is preferable to code-only constants because the command-governance surface is part of milestone governance, not just implementation detail.
- Assumption: Phase 76 boundary audit output, when available, should inform test coverage and hard-gated command inventory, but Phase 77 planning does not depend on waiting for a new artifact shape.
- Assumption: Phase 76 audit results can refine the policy map later without changing the Phase 77 artifact shape.
- Open question: whether `drift reconcile` should stay hard-gated or be promoted to recovery-only is intentionally resolved in favor of hard-gated mutation plus separate recovery diagnostics such as `drift preview`.

## Don't Hand-Roll

- do not create a second governance artifact parallel to the degraded-state artifact
- do not deduplicate warnings across sessions
- do not mark all planning commands as authoritative by default
- do not let recovery commands become blocked by the same surfaces they are meant to repair
- do not trust CLI narrowing enough to remove subsystem fail-closed checks

## Code Examples

### Recommended governance lookup

```javascript
function classifyCommand(route) {
  return governanceMap.lookup({
    command: route.command,
    subcommand: route.subcommand,
    mode: route.mode || null,
  }) || 'warn_only';
}
```

### Recommended consequence handling

```javascript
function evaluateGovernance(route, degradedState) {
  const classification = classifyCommand(route);
  if (classification === 'recovery_only') return { allowed: true };
  if (classification === 'hard_gated_state_transition' && degradedState.aggregate_state === 'UNSAFE') {
    return { allowed: false, reason: 'unsafe truth posture' };
  }
  if (classification === 'warn_only' && degradedState.aggregate_state !== 'HEALTHY') {
    return { allowed: true, warning: degradedState.aggregate_state };
  }
  return { allowed: true };
}
```

## Bottom Line

Phase 77 should not add more safety machinery. It should make the existing safety machinery usable by centralizing governance policy, preserving fast execution for non-authoritative work, and keeping strict blocking only where truth can actually be corrupted.

<!-- GSD-AUTHORITY: 77-01-1:8862d65551f99775ab629b165468fc756a9d476369faf8adbac83e9769e3f83a -->

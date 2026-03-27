# Phase 77: Execution Surface Governance - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 77 narrows the Phase 75 enforcement surface so the repo behaves like a governed execution kernel rather than a health-first product. It must preserve fail-closed truth protection while reducing operator friction by gating only authoritative truth boundaries, keeping non-authoritative execution broadly runnable, and ensuring recovery paths always remain available.

Phase 77 does not weaken subsystem safety. It changes where operator-facing blocking applies and how commands are classified, not whether underlying truth-bearing helpers may lie.

</domain>

<decisions>
## Implementation Decisions

### Canonical governance classes
- Phase 77 defines four command classes:
  - `ungated_execution`
  - `warn_only`
  - `hard_gated_state_transition`
  - `recovery_only`
- Meanings:
  - `ungated_execution`
    - always allowed
    - no authoritative truth assertion or mutation
  - `warn_only`
    - allowed
    - emits structured degraded warnings each invocation
  - `hard_gated_state_transition`
    - blocked under `UNSAFE`
    - may warn under `DEGRADED`
    - mutates, finalizes, or asserts authoritative truth
  - `recovery_only`
    - always allowed, including under `UNSAFE`
    - exists to inspect, diagnose, or repair system truth posture

### Classification unit
- Classification applies per:
  - command
  - subcommand
  - mode or workflow
- Example intent:
  - `context build --workflow plan-phase` can be hard-gated
  - `context build --workflow scratch` can remain ungated or warn-only
- Phase 77 must not classify only by top-level command family.

### Truth-bearing state transition set
- The following operations are hard-gated:
  - phase completion
  - milestone completion
  - verification finalization and current-truth claims
  - roadmap or state advancement
  - canonical memory-backed planning context build
  - reconciliation mutation entrypoints
  - any command that writes authoritative truth to `STATE.md`
  - any command that updates verification artifacts as final truth
- If a command asserts truth, mutates truth, or finalizes truth, it is hard-gated.

### Ungated execution boundary
- The following stay broadly ungated:
  - code generation
  - non-authoritative file creation
  - test execution
  - drafts
  - scratch outputs
  - exploratory commands
- These may become warn-only when degraded inputs could make outputs misleading.
- Execution remains free; authoritative truth remains gated.

### Warning contract
- `warn_only` commands remain runnable but emit structured warnings every invocation.
- Raw warning output must include:
  - subsystem
  - state
  - implication
- Warnings must never be silently suppressed or session-deduplicated.

### Memory dependence boundary
- Authoritative planning that claims canonical memory-backed context is hard-gated.
- Freeform generation, brainstorming, scratch planning, and non-authoritative drafts remain allowed.
- Split:
  - authoritative planning -> hard-gated
  - exploratory planning -> ungated or warn-only

### Recovery exemption set
- The following commands must remain runnable as `recovery_only`:
  - `brain health`
  - degraded-state inspection
  - `drift scan`
  - `drift status`
  - `drift preview`
  - integrity diagnostics
  - verification inspection or read-only analysis
  - config repair surfaces
- The system must always be able to diagnose and repair itself while degraded.

### Canonical policy map
- Phase 77 centralizes governance policy in:
  - `.planning/policy/command-governance.yaml`
- This file becomes the single source of truth for command classification.
- Classification must not be scattered across ad hoc conditionals in multiple CLI routes.

### Enforcement layering
- CLI routing narrows the operator-facing blocking surface.
- Subsystem helpers remain universal fail-closed backstops.
- Subsystems must never trust CLI routing alone to prevent false truth behavior.

### Artifact reuse
- Phase 77 reuses the Phase 75 degraded-state artifact as the policy input.
- It must not introduce a second governance artifact.
- Command governance is policy applied on top of degraded truth, not a parallel truth source.

### Default policy for new commands
- New commands default to `warn_only`.
- Hard-gated or recovery-only behavior requires explicit classification.
- This preserves flow while still surfacing degraded truth.

### Operator UX target
- Operator should experience:
  - uninterrupted execution for non-authoritative work
  - precise blocking only at authoritative truth boundaries
  - clear reason, implications, and next options when blocked
- Phase 77 exists to make the system usable without weakening governance.

### Claude's Discretion
- Exact YAML layout inside `.planning/policy/command-governance.yaml`
- Whether to implement governance lookup in a dedicated helper module or extend the existing degraded-mode helper layer
- Exact command naming in the policy map so long as it is deterministic, testable, and centrally maintained

</decisions>

### Unresolved Ambiguities

- None. Governance classes, recovery exemptions, memory boundary, and operator UX target are locked for planning.

### Interpreted Assumptions

- Phase 76 boundary audit output, when available, should inform test coverage and hard-gated command inventory, but Phase 77 planning does not depend on waiting for a new artifact shape.

<specifics>
## Specific Ideas

- Phase 75 made unsafe truth impossible to ignore.
- Phase 77 makes that protection usable by aiming blocking only at truth boundaries.
- The system should feel fast for execution and strict for authoritative state transitions.
- Recovery commands must never be victims of the safety system they exist to repair.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — degraded-mode, operator truth, and memory-trust rules
- `.planning/REQUIREMENTS.md` — especially `TRUTH-DEGRADE-01`, `TRUTH-BYPASS-01`, `TRUTH-OPS-01`, and `TRUTH-CLAIM-01`
- `.planning/ROADMAP.md` — official Phase 77 goal and plan split
- `.planning/STATE.md` — current truth posture and operator-facing progression state

### Upstream Phase Outputs
- `.planning/phases/75-degraded-mode-enforcement/75-CONTEXT.md` — canonical degraded-policy and fail-closed boundary
- `.planning/phases/75-degraded-mode-enforcement/75-RESEARCH.md` — existing enforcement architecture and policy inputs
- `.planning/drift/latest-reconciliation.json` — applied truth consequences available to governance decisions
- `.planning/health/latest-degraded-state.json` — current degraded-policy artifact reused by Phase 77

### Existing Code Surfaces
- `get-stuff-done/bin/lib/degraded-mode.cjs` — canonical degraded-state policy input and workflow evaluation
- `get-stuff-done/bin/gsd-tools.cjs` — top-level CLI routing where governance narrowing must appear
- `get-stuff-done/bin/lib/context.cjs` — planning workflow gating surface
- `get-stuff-done/bin/lib/verify.cjs` — verification and integrity truth-claiming commands
- `get-stuff-done/bin/lib/commands.cjs` — operator-facing status and health readers that must stay usable

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `degraded-mode.cjs` already computes current truth posture and can remain the policy input for command governance.
- `gsd-tools.cjs` already centralizes top-level command dispatch, making it the right place for command-class application.
- `context.cjs` and `verify.cjs` already contain truth-bearing boundaries that should remain hard-gated.

### Established Patterns
- Phase 73 separated machine truth from operator presentation.
- Phase 74 separated drift detection from applied consequence.
- Phase 75 separated diagnostic visibility from blocked unsafe truth-bearing workflows.

### Integration Points
- Phase 77 should apply a command governance map on top of Phase 75 degraded truth.
- CLI routes should consult the governance map before deciding whether a degraded or unsafe condition should warn, block, or remain recovery-only.
- Subsystem fail-closed paths should remain unchanged as safety backstops even when CLI blocking narrows.

</code_context>

<deferred>
## Deferred Ideas

- Phase-level truth artifact standardization belongs to Phase 78.
- End-to-end adversarial integrity gauntlet belongs to Phase 79.
- Broader operator ergonomics beyond command governance belong to later milestone work.

</deferred>

---

*Phase: 77-execution-surface-governance*
*Context gathered: 2026-03-27*

<!-- GSD-AUTHORITY: 77-01-1:c85aa7009ce0de1a4316702f283e9278a736ad600c77a72be73036ca4f1f89fd -->

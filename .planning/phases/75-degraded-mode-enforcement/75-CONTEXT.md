# Phase 75: Degraded Mode Enforcement - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 75 turns drift and health truth into enforced operational behavior. It must normalize subsystem health into one canonical policy vocabulary, emit a machine-readable degraded-state artifact, and block or warn truth-bearing workflows according to deterministic fail-closed rules.

Phase 75 is the first phase where degraded truth must alter workflow behavior directly. It must not silently continue truth-bearing planning, verification, or memory-backed flows when canonical dependencies are unsafe or stale.

</domain>

<decisions>
## Implementation Decisions

### Canonical degraded-state vocabulary
- Operator-facing degraded state is restricted to:
  - `HEALTHY`
  - `DEGRADED`
  - `UNSAFE`
- Existing raw labels map into this policy model:
  - `healthy`, `ok`, `ready` -> `HEALTHY`
  - `degraded`, `warning`, `disconnected-but-noncritical` -> `DEGRADED`
  - `blocked`, `error`, `failed`, `unavailable-critical`, `UNHEALTHY` -> `UNSAFE`
- Raw diagnostics may retain finer-grained detail.
- Policy and operator truth must expose only the canonical three-state model.

### Behavioral consequence model
- Policy is evaluated per subsystem and aggregated globally by worst truth-bearing state.
- `HEALTHY`
  - action allowed
  - no warning required
  - full truth-bearing workflows enabled
- `DEGRADED`
  - action allowed only when the workflow remains trustworthy
  - warning required
  - only explicitly sanctioned fallback is allowed
  - outputs must mark reduced trust or reduced capability
- `UNSAFE`
  - truth-bearing action blocked
  - diagnostic and status commands remain allowed
  - no silent fallback is allowed
  - blocked flows must emit plain-English reason, implications, and next options

### Mandatory enforcement scope
- Phase 75 must enforce real behavior changes for:
  - model-facing memory
  - Open Brain recall when used for truth-bearing planning context
  - Planning Server
  - drift report freshness
  - reconciliation freshness
  - verification surfaces
- Phase 75 may keep visibility-only handling for:
  - broker or RabbitMQ
  - ancillary async infrastructure not on the immediate truth path
- If a subsystem affects planning truth, verification truth, operator truth, or state/reporting truth, it is in enforcement scope now.

### Memory fail-closed boundary
- Canonical Postgres-backed memory must fail closed for:
  - planner context build using model-facing memory
  - any workflow presenting curated memory as trustworthy context
  - truth-bearing retrieval surfaces that depend on canonical memory truth
- Bounded degraded mode is allowed only for:
  - non-truth-bearing logging
  - append-only local diagnostics
  - operator inspection commands
  - explicitly non-authoritative local buffering
- Executor writeback is included when writeback is presented as canonical workflow memory.
- Planning flows may not operate on partial trust.
- Planning is either memory-backed and trustworthy or memory-disabled.

### Canonical source and artifact
- `brain health --raw` is the canonical machine-readable health truth surface.
- Phase 75 must also write a canonical degraded-state artifact:
  - `.planning/health/latest-degraded-state.json`
- The degraded-state artifact must record:
  - subsystem states
  - aggregate state
  - enforcement consequences
  - freshness timestamps
  - blocked workflows
  - source attribution
- Higher-level reader surfaces should consume this canonical artifact rather than infer degraded state independently.

### Staleness enforcement
- Missing or stale drift or reconciliation truth is enforceable degraded state.
- Diagnostic-only commands may surface stale truth as `DEGRADED`.
- Commands that rely on current truth posture must treat stale or missing truth as `UNSAFE`.
- Staleness can block:
  - reconciliation-dependent verification
  - integrity or verification commands that claim current truth posture
  - planning and execution flows that depend on up-to-date truth enforcement
  - milestone or phase completion surfaces

### Coupling with Phase 74 outputs
- Phase 75 consumes:
  - `.planning/drift/latest-reconciliation.json`
  - relevant state markers
  - live subsystem health
- Reconciliation output is the canonical applied-history input.
- Live subsystem health is the canonical current-enforcement input.
- If they conflict, live subsystem health wins for current enforcement while reconciliation remains the audit trail.

### Fail-closed trigger thresholds
- A subsystem becomes `UNSAFE` when any of the following are true:
  - a required truth-bearing dependency is unavailable
  - required drift or reconciliation truth is stale beyond policy threshold
  - the workflow would need silent fallback to continue
  - the workflow would present inferred optimism instead of evidence-backed truth
  - canonical memory truth required for planning is unavailable
- A subsystem becomes `DEGRADED` when:
  - capability is reduced
  - trust boundaries remain explicit
  - the workflow can still continue without false claims

### Enforcement points
- Phase 75 must enforce degraded behavior at both:
  - top-level CLI routes
  - subsystem helpers
- Top-level routes provide operator-readable blocking, implications, and options.
- Subsystem helpers provide the fail-closed backstop.
- Blocked flows must emit structured failure classifications that include:
  - subsystem
  - canonical state
  - reason
  - implications
  - next options

### Claude's Discretion
- Exact JSON schema field names inside `.planning/health/latest-degraded-state.json`
- Whether to add one dedicated degraded-mode policy helper module or extend existing brain/health helpers directly
- Exact freshness thresholds so long as they are deterministic, testable, and documented

</decisions>

### Unresolved Ambiguities

- None. Vocabulary, behavioral boundary, memory fail-closed rules, and enforcement model are locked for planning.

### Interpreted Assumptions

- None. The degraded-state model and fail-closed boundary are explicit.

<specifics>
## Specific Ideas

- Phase 73 made drift visible.
- Phase 74 made drift consequential.
- Phase 75 makes unsafe truth impossible to operationally ignore.
- Truth-bearing planning and verification should stop cleanly, not limp forward under optimistic fallback.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — degraded mode, memory truth, and operator visibility rules
- `.planning/REQUIREMENTS.md` — especially `TRUTH-DEGRADE-01`, `TRUTH-MEMORY-01`, and `TRUTH-OPS-01`
- `.planning/ROADMAP.md` — official Phase 75 goal and plan split
- `.planning/STATE.md` — current reconciliation truth and stale state surfaces that Phase 75 must stop trusting implicitly

### Upstream Phase Outputs
- `.planning/phases/73-drift-detection-engine/73-CONTEXT.md` — drift visibility contract
- `.planning/phases/74-state-reconciliation-layer/74-CONTEXT.md` — reconciliation contract and mutation boundary
- `.planning/drift/latest-report.json` — current drift observation artifact
- `.planning/drift/latest-reconciliation.json` — applied reconciliation history

### Existing Code Surfaces
- `get-stuff-done/bin/lib/brain-manager.cjs` — current operator health and backend truth surface
- `get-stuff-done/bin/lib/second-brain.cjs` — canonical model-facing memory fail-closed boundary
- `get-stuff-done/bin/lib/commands.cjs` — existing `health degraded-mode` policy surface
- `get-stuff-done/bin/lib/verify.cjs` — verification and integrity commands that must not over-claim under stale or unsafe truth
- `get-stuff-done/bin/gsd-tools.cjs` — CLI routes where top-level enforcement must appear

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `brain-manager.cjs` already surfaces backend health, model-facing memory availability, and drift-health snapshots.
- `second-brain.cjs` already has `requirePostgres()` and model-facing read/write boundaries that can be elevated into explicit Phase 75 fail-closed policy.
- `commands.cjs` already exposes `health degraded-mode`, which is a natural reader surface for canonical degraded-policy truth.
- `verify.cjs` already centralizes truth-bearing verification commands that should refuse to proceed when freshness or dependency posture is unsafe.

### Established Patterns
- Phase 53 and 54 already established fail-closed semantics for model-facing memory under degraded backend conditions.
- Phase 73 writes a canonical runtime report instead of letting readers recompute drift.
- Phase 74 writes a canonical reconciliation artifact and status markers instead of leaving downgrade as narrative-only output.

### Integration Points
- Phase 75 should aggregate live health plus Phase 73/74 artifacts into one degraded-state snapshot.
- `brain health --raw`, `health degraded-mode`, and truth-bearing CLI routes should read the same degraded-state truth rather than recompute partial policy.
- Planning and verification flows should use subsystem-level fail-closed helpers as backstops even if CLI routing misses a gate.

</code_context>

<deferred>
## Deferred Ideas

- Broad bypass auditing belongs to Phase 76.
- Phase-level truth artifact standardization belongs to Phase 77.
- Adversarial end-to-end degraded-mode gauntlet belongs to Phase 78.

</deferred>

---

*Phase: 75-degraded-mode-enforcement*
*Context gathered: 2026-03-27*

<!-- GSD-AUTHORITY: 75-00-0:fe5578e931bce84a960528b39f1224733f479592c29cfb07d3580bb74910099e -->

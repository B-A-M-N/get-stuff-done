# Phase 74: State Reconciliation Layer - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 74 consumes the runtime drift report produced by Phase 73 and applies deterministic reconciliation to truth-bearing status surfaces. It is responsible for turning predicted impact into sanctioned status downgrade, conditionality, and re-verification requirements without inventing new evidence or silently rewriting truth outside approved interfaces.

Phase 74 is the first mutation phase in the drift stack. It should apply consequences, not detect new drift or speculate on missing evidence beyond what Phase 73 already classified.

</domain>

<decisions>
## Implementation Decisions

### Reconciliation input source
- Phase 74 consumes `.planning/drift/latest-report.json` as the current drift input.
- Phase 70 catalog remains baseline context.
- Phase 73 report remains the authoritative current drift observation.

### Mutation boundary
- Unlike Phase 73, Phase 74 may mutate sanctioned truth-bearing status surfaces.
- Mutations must happen through sanctioned CLI/library paths rather than ad hoc file rewrites.
- Reconciliation must never create evidence; it only applies consequences from existing classified drift.

### Deterministic downgrade intent
- Reconciliation must downgrade affected status mechanically based on severity and affected-surface annotations from Phase 73.
- Historical-only drift does not force current-state downgrade.
- Active drift may trigger:
  - invalidation
  - conditional validity
  - re-verification required markers
  - degraded operator health
- Downgrade matrix is fixed:
  - `CRITICAL` -> `verification_status=INVALID`, `phase_status=INVALID`, `roadmap_status=BLOCKED`, `operator_health=UNHEALTHY`
  - `MAJOR` -> `verification_status=CONDITIONAL`, `phase_status=CONDITIONAL`, `roadmap_status=AT_RISK`, `operator_health=DEGRADED`
  - `MINOR` -> `verification_status=VALID`, `phase_status=VALID`, `roadmap_status=INFO`, `operator_health=HEALTHY_WITH_WARNINGS`
- Worst severity wins per affected surface.

### Truth surfaces in scope
- Phase 74 reconciliation may affect:
  - verification status surfaces
  - phase status surfaces
  - roadmap/state truth markers
  - operator health truth
- Phase 74 must not hide original evidence or rewrite history; it applies status consequences and required follow-up markers.

### Re-verification triggers
- Re-verification is required when active drift invalidates or materially downgrades previously trusted verification or phase claims.
- Re-verification requirements must be machine-readable so later operator and audit flows can act on them deterministically.

### Sanctioned output
- Phase 74 must produce `.planning/drift/latest-reconciliation.json` as the canonical audit artifact.
- The reconciliation artifact must record:
  - source report identity
  - applied downgrade decisions
  - unchanged surfaces
  - re-verification requirements
  - severity summary
- Every applied change must carry `from`, `to`, `reason`, and evidence reference fields.

### Command surface
- Canonical mutation entrypoint: `gsd:drift reconcile`
- Supporting dry-run surface: `gsd:drift preview`
- `gsd:drift status` remains the read-only operator truth surface
- `reconcile` is the only mutation command

### Mutation scope lock
- Phase 74 must mutate:
  - `STATE.md` truth and degraded markers
  - phase metadata or phase-status truth markers
  - operator health markers
  - machine-readable re-verification markers
- Phase 74 must not mutate:
  - `ROADMAP.md` structure
  - `REQUIREMENTS.md`
  - historical artifacts
  - code or runtime behavior itself

### Adapter boundary
- Phase 74 must normalize Phase 73 report inputs through a thin reconciliation adapter before rule evaluation.
- Reconciliation logic must not depend directly on raw Phase 73 report shape.
- Adapter location is expected to live alongside reconciliation code as a narrow translation layer.

### Claude's Discretion
- Exact field names inside the adapter-normalized intermediate structure
- Exact representation of phase metadata markers so long as mutation stays inside sanctioned surfaces

</decisions>

### Unresolved Ambiguities

- None

### Interpreted Assumptions

- Phase 74 uses the Phase 73 report’s `affected` and `predicted_effect` data as inputs rather than recomputing its own detection layer.

<specifics>
## Specific Ideas

- Phase 73 knows the system is lying.
- Phase 74 makes the system stop claiming it is healthy when drift proves otherwise.
- Reconciliation is status mutation, not repair.
- Evidence remains upstream; consequences happen here.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — downgrade and truth-enforcement rules
- `.planning/PROJECT.md` — milestone framing and non-goals
- `.planning/REQUIREMENTS.md` — especially `TRUTH-DRIFT-02` and `TRUTH-CLAIM-01`
- `.planning/ROADMAP.md` — official Phase 74 goal

### Upstream Phase Outputs
- `.planning/phases/73-drift-detection-engine/73-CONTEXT.md` — locked detection/mutation boundary
- `.planning/phases/70-drift-surface-mapping/drift_catalog.yaml` — baseline truth surface inventory
- `.planning/phases/72-verification-hardening/72-CONTEXT.md` — hardened verification contract that later downgrades may affect

### Existing Code Surfaces
- `get-stuff-done/bin/lib/state.cjs` — sanctioned state update/read surface
- `get-stuff-done/bin/lib/verify.cjs` — verification truth surface likely to be downgraded or marked for re-verification
- `get-stuff-done/bin/lib/roadmap.cjs` — roadmap status and plan progress truth surface
- `get-stuff-done/bin/gsd-tools.cjs` — command surface for reconciliation entrypoints

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `state.cjs` already contains sanctioned mutation helpers for state surfaces.
- `roadmap.cjs` already mutates roadmap progress and status surfaces.
- `verify.cjs` already reasons about coherence, integrity, and verification status, making it a natural consumer of reconciliation results rather than a place to invent parallel downgrade logic.

### Established Patterns
- Phase 72 moved verification to evidence-first statuses.
- Phase 73 is expected to emit machine-readable predicted impacts rather than mutate state.
- Existing repo patterns prefer deterministic CLI operations plus signed artifacts over undocumented inline edits.

### Integration Points
- Phase 74 consumes Phase 73 report output.
- Phase 74 becomes the bridge from drift visibility to enforceable truth status.
- Later degraded-mode and phase-truth-contract work will rely on reconciliation state instead of raw drift reports alone.

</code_context>

<deferred>
## Deferred Ideas

- Actual repair/remediation plans belong to later phases.
- Broader end-to-end enforcement of reconciliation outcomes belongs to later milestone phases.
- Phase-truth artifact standardization is deferred to Phase 77.

</deferred>

---

*Phase: 74-state-reconciliation-layer*
*Context gathered: 2026-03-27*

<!-- GSD-AUTHORITY: 74-00-0:e0f8fc80d103c5a47e621be250d2fb434bfb37f2db31acc7a4a60c4fd3c9799e -->

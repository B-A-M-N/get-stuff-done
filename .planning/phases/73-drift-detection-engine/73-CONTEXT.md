# Phase 73: Drift Detection Engine - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 73 turns the Phase 70 catalog and Phase 72 verification contract into an active detection engine. It must scan the current truth surface, classify drift mechanically, annotate predicted impact across truth-bearing surfaces, and expose the result through a canonical operator CLI without mutating system state.

Phase 73 is detection and classification only. It does not reconcile or downgrade live state artifacts directly. That mutation boundary belongs to Phase 74.

</domain>

<decisions>
## Implementation Decisions

### Detection scope source
- `drift_catalog.yaml` is the authoritative baseline scope.
- The engine may expand scope dynamically when runtime or repo state exposes additional truth-bearing surfaces.
- Scope mismatches are first-class findings:
  - surface in runtime but not in catalog -> `untracked_surface`
  - surface in catalog but missing at scan time -> `missing_surface`
- Catalog scope defines expected truth surface.
- Runtime scope defines actual truth surface.
- Mismatch between expected and actual scope is drift.

### Severity and mutation boundary
- Phase 73 may:
  - detect drift
  - assign severity
  - predict downstream impact
- Phase 73 may not:
  - mutate `STATE.md`
  - rewrite roadmap or verification artifacts
  - reconcile or apply downgrades
- Predicted impact is allowed only as annotation, not mutation.

### CLI surface
- Phase 73 ships as a command cluster with one canonical operator entrypoint.
- Canonical command:
  - `drift status`
- Supporting commands:
  - `drift scan`
  - `drift report`
- `drift status` is the primary operator truth surface.

### Output artifact contract
- The primary runtime truth artifact is:
  - `.planning/drift/latest-report.json`
- The report is runtime-generated and not intended as a checked-in planning artifact.
- `drift scan --json` may emit the same report to stdout.
- `drift status` renders a human-readable operator view from the latest scan result.
- Current runtime report outranks the static Phase 70 catalog when reporting present drift state.
- The catalog remains the baseline source for expected scope and interpretation.

### Runtime evidence depth
- Phase 73 uses active probing by default for:
  - CLI truth surfaces
  - health surfaces
  - installed/runtime behavior
- Probe results classify as:
  - subsystem unavailable -> `degraded_state`
  - probe failure without contradiction -> `insufficient_evidence`
  - direct contradiction between runtime and expected truth -> drift
- Unavailability alone is not automatic drift.
- Contradiction is drift.

### Historical drift handling
- Historical drift is always retained in machine output.
- Default operator status surfaces only active drift.
- Historical drift is included through an expanded mode such as `--full`.
- Historical drift remains visible but suppressed by default in operator summaries.

### Affected truth-status mapping
- Phase 73 must annotate predicted impact on:
  - verification status
  - phase status
  - roadmap status
  - operator health
- Annotated impact is descriptive and machine-readable only.
- No status mutation happens in Phase 73.

### Operator truth integration
- Phase 73 must surface drift through:
  - `drift status`
  - operator health truth, including `brain health`/degraded health surfaces where relevant
- Phase 73 must not rewrite roadmap or state artifacts yet.
- Operator surfaces must expose drift as backend truth, not optimistic inference.

### Conflict resolution basis
- Strong contradiction with direct evidence is required for strong drift claims.
- Partial or missing proof is classified conservatively as `insufficient_evidence` or the lowest justified drift class.
- Classification rules:
  - strong contradiction -> `execution_drift`
  - stale or contradictory verification artifact -> `verification_drift`
  - missing implementation for required behavior -> `spec_drift`
  - implementation mismatch without runtime contradiction -> `implementation_drift`
- No strong evidence means no strong claim.

### Exit-code behavior
- Scan failure exits non-zero as an execution error.
- `CRITICAL` drift exits non-zero for pipeline/operator use.
- `MAJOR` and `MINOR` drift exit zero and surface warnings/information instead.

### Claude's Discretion
- Exact JSON schema shape of `.planning/drift/latest-report.json`
- Exact helper/module boundaries for scan, status rendering, and report serialization
- Which existing health command is the narrowest integration point for drift visibility

</decisions>

### Unresolved Ambiguities

- None. Detection scope, severity boundary, operator surface, and exit behavior are locked for planning.

### Interpreted Assumptions

- None. The detection-vs-reconciliation split is explicit.

<specifics>
## Specific Ideas

- Phase 73 is where drift becomes impossible to ignore.
- Catalog is the baseline, runtime is the truth check.
- The engine must know when the system is lying without trying to fix it yet.
- `status` is for operators, `scan` is for engines, `report` is for machine consumers.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — milestone-wide drift, truth, operator, and downgrade rules
- `.planning/PROJECT.md` — active milestone framing for `v0.7.0`
- `.planning/REQUIREMENTS.md` — especially `TRUTH-DRIFT-01`, `TRUTH-DRIFT-02`, and `TRUTH-OPS-01`
- `.planning/ROADMAP.md` — official Phase 73 goal and plan split

### Upstream Phase Outputs
- `.planning/phases/70-drift-surface-mapping/70-CONTEXT.md` — baseline truth-surface scope and authority order
- `.planning/phases/70-drift-surface-mapping/drift_catalog.yaml` — source catalog that Phase 73 must consume
- `.planning/phases/70-drift-surface-mapping/70-DRIFT-SUMMARY.md` — human interpretation layer for baseline hotspots
- `.planning/phases/72-verification-hardening/72-CONTEXT.md` — evidence-first verification contract
- `.planning/phases/72-verification-hardening/72-02-SUMMARY.md` — Phase 72 output that now emits typed verification drift inputs

### Existing Code Surfaces
- `get-stuff-done/bin/lib/drift-catalog.cjs` — current catalog generation and live probe collection
- `get-stuff-done/bin/lib/drift-classifier.cjs` — current drift type and severity helpers
- `get-stuff-done/bin/lib/state.cjs` — state truth surface to annotate but not mutate in this phase
- `get-stuff-done/bin/lib/brain-manager.cjs` — operator health surface relevant to drift visibility
- `get-stuff-done/bin/gsd-tools.cjs` — CLI surface to extend with `drift scan|status|report`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `drift-catalog.cjs` already collects live probes and compares installed/runtime vs repo-local truth, which Phase 73 can elevate into a reusable scan engine.
- `drift-classifier.cjs` already has deterministic drift type and severity primitives that can be extended rather than replaced.
- `brain-manager.cjs` and health surfaces already emit degraded/truth-facing operator status and are the natural place to inject drift visibility.

### Established Patterns
- Phase 70 already distinguishes active, historical, and healthy states.
- Phase 72 already emits typed verification drift and evidence-bound final status.
- Existing CLI surfaces prefer machine JSON plus human-readable summaries rather than one-off shell parsing.

### Integration Points
- Phase 73 consumes the Phase 70 catalog and Phase 72 verification outputs directly.
- Phase 73 produces the runtime drift report that Phase 74 will reconcile against.
- Health/operator surfaces should observe the report, not recompute ad hoc drift logic.

</code_context>

<deferred>
## Deferred Ideas

- Deterministic state mutation and downgrade application belong to Phase 74.
- Repair planning or remediation workflows belong to later phases.
- Roadmap/state artifact rewriting is deferred until reconciliation rules are locked.

</deferred>

---

*Phase: 73-drift-detection-engine*
*Context gathered: 2026-03-27*

<!-- GSD-AUTHORITY: 73-00-0:4f5d6e9ee1b3c3500f5b4baf4dc7e84ac2364c74f715c91914228990a80eefcf -->

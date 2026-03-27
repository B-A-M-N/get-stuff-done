# Phase 70: Drift Surface Mapping - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 70 establishes a complete, evidence-bound inventory of the system's truth surfaces so later phases can enforce proof, verification, drift detection, and reconciliation mechanically instead of heuristically.

This phase does not yet implement the full drift engine. It defines what surfaces are in scope, how conflicts are interpreted, how drift entries are structured, and what artifacts Phase 70 must emit for downstream automation.

</domain>

<decisions>
## Implementation Decisions

### Drift map scope
- The drift map uses **full truth surface** scope.
- It must inventory:
  - planning artifacts: `ROADMAP.md`, `REQUIREMENTS.md`, `PLAN.md`, `SUMMARY.md`, `VERIFICATION.md`
  - code and runtime behavior
  - CLI and operator surfaces
  - degraded-mode signaling
  - memory truth boundaries for Second Brain and Open Brain
  - installed/runtime behavior, not just repo-local state
- Any surface that can influence execution, state reporting, or verification is in scope.

### Source-of-truth hierarchy
- Conflicts are resolved with **evidence-first layered interpretation**.
- Final authority order is:
  - evidence: tests, runtime results, commits, files
  - code
  - verification artifacts
  - roadmap and requirements
- No document is allowed to override evidence.

### Drift entry model
- Drift entries use a **mixed requirement-centric model with artifact binding**.
- Every drift entry must map:
  - requirement
  - implementation
  - evidence
  - drift type
  - severity
- Requirement-only or artifact-only inventory is not sufficient.

### Historical depth
- Phase 70 includes:
  - the current active system
  - recent high-impact phases 50-55
  - any older component that still affects execution, planning, or verification
- Fully dead or disconnected legacy paths are out of scope.
- This is a **recent + structural history** model, not full historical excavation.

### Historical drift treatment
- Historical drift must be cataloged but is non-blocking for current milestone progress.
- Active drift is blocking.
- Historical drift must still be recorded and clearly labeled rather than ignored.

### Output artifacts
- Phase 70 must produce dual outputs:
  - machine artifact: `drift_catalog.yaml`
  - human artifact: `70-DRIFT-SUMMARY.md`
- The machine artifact is the source of truth.
- The human-readable summary is the interpretation layer.
- `70-CONTEXT.md` remains the locked planning input for the phase and must not be repurposed as generated execution output.

### Severity assignment
- Severity uses a **two-factor model**:
  - impact: whether it causes false system-state perception
  - exploitability: whether the system can proceed incorrectly because of it
- Severity matrix:
  - high impact + high exploitability -> `CRITICAL`
  - high impact + low exploitability -> `MAJOR`
  - low impact + high exploitability -> `MAJOR`
  - low impact + low exploitability -> `MINOR`
- If a condition can produce false truth perception, it must be treated as `CRITICAL`.

### Memory truth handling
- Memory is included through **boundary + light inventory**.
- Phase 70 must map:
  - when memory is trusted
  - when memory is disabled
  - health signaling and degraded behavior
- Phase 70 does not attempt deep modeling of embedding quality, recall tuning, or ranking internals.
- Memory must be treated as trusted or disabled, never partially trusted.

### Claude's Discretion
- Exact field layout inside `drift_catalog.yaml`
- Whether machine output is emitted by one command or a narrow helper path during Phase 70
- How best to group drift hotspots in the human-readable summary

</decisions>

### Unresolved Ambiguities

- None. Phase-defining ambiguity was resolved before planning.

### Interpreted Assumptions

- None. The phase decisions above are locked explicitly rather than carried as guidance-only assumptions.

<specifics>
## Specific Ideas

- Phase 70 is not a planning-only audit. It is a **truth surface enumeration** pass.
- “If a surface can influence execution, state reporting, or verification, it must be included.”
- “Machine artifact is source of truth; markdown is the view layer.”
- “Evidence > Code > Verification > Roadmap” is the binding conflict rule.
- Historical mess should be visible but not allowed to stall current control-layer progress unless it remains active.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — locked milestone-wide truth, drift, degraded-mode, and authority rules
- `.planning/PROJECT.md` — active milestone framing for `v0.7.0`
- `.planning/REQUIREMENTS.md` — phase-relevant truth and drift requirements, especially `TRUTH-CLAIM-01` and `TRUTH-DRIFT-01`
- `.planning/ROADMAP.md` — official Phase 70 scope and dependency position

### Existing Enforcement Surfaces
- `.planning/MEGAPROMPT.md` — existing repo-wide invariants, gate language, and enforcement expectations
- `get-stuff-done/workflows/plan-phase.md` — current plan-time gates and traceability behavior
- `get-stuff-done/workflows/execute-plan.md` — current execution, checkpoint, and summary flow
- `get-stuff-done/templates/verification-report.md` — current verification artifact structure that later phases will harden
- `get-stuff-done/templates/summary.md` — current summary contract and machine-readable assumptions

### Drift-Relevant Existing Implementations
- `get-stuff-done/bin/lib/commands.cjs` — summary extraction, verification scaffolding, and execution-facing artifact handling
- `get-stuff-done/bin/lib/init.cjs` — phase and milestone inventory logic already used to infer project state
- `get-stuff-done/bin/lib/state.cjs` — state verification and status propagation behavior
- `get-stuff-done/bin/lib/roadmap-plane-sync.cjs` — existing drift terminology and sync drift detection patterns

### Recent Proof/Drift Context
- `.planning/v0.6.0-MILESTONE-AUDIT.md` — recent evidence that closeout drift existed and had to be repaired
- `.planning/phases/55-open-brain-v1-foundations/55-VERIFICATION.md` — latest phase verification artifact style
- `.planning/phases/55-open-brain-v1-foundations/55-VALIDATION.md` — current validation bookkeeping pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `get-stuff-done/bin/lib/commands.cjs`: already contains summary extraction, verification scaffolding, and evidence-adjacent CLI behavior that can be mined for truth surfaces.
- `get-stuff-done/bin/lib/init.cjs`: already computes phase/milestone inventory and can reveal where inferred state depends on roadmap structure.
- `get-stuff-done/bin/lib/state.cjs`: already exposes state verification and status logic that may drift from actual artifact truth.
- `get-stuff-done/bin/lib/roadmap-plane-sync.cjs`: already has drift detection concepts for roadmap sync, which can inform terminology and detection structure.

### Established Patterns
- Machine-readable frontmatter already exists for summary and verification artifacts, so Phase 70 should inventory and reuse those contracts rather than invent freeform parsing first.
- The repo already distinguishes planning truth, execution truth, and operator status surfaces, but those boundaries are not yet unified under one drift model.
- Recent milestone work showed installed-runtime truth can diverge from repo-local truth, so runtime-installed surfaces must be inventoried explicitly.

### Integration Points
- Phase 70 output should feed directly into later proof-chain, verification-hardening, and drift-detection phases.
- The machine artifact needs to be stable enough that Phase 73 can consume it without reinterpreting human prose.
- Memory truth boundaries should be inventoried now but left behaviorally deeper work for later degraded-mode enforcement.

</code_context>

<deferred>
## Deferred Ideas

- Full enforcement engine implementation belongs to later phases, especially 71-78.
- Deep memory-quality modeling, embedding quality, and recall tuning are explicitly out of scope.
- Full historical archaeology of disconnected legacy artifacts is out of scope unless those surfaces still affect current behavior.

</deferred>

---

*Phase: 70-drift-surface-mapping*
*Context gathered: 2026-03-27*

<!-- GSD-AUTHORITY: 70-00-0:27ab8e045df5fb3b52de7cdbc80e5db3939774e4adceef10a89afa7f6bbca4b8 -->

# Phase 78: Phase Truth Contracts - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 78 establishes a generated, machine-authoritative phase-level truth contract that synthesizes existing truth sources into one per-phase validity artifact. It standardizes the authoritative machine artifact, the operator-facing markdown projection, deterministic status derivation, and the generation/validation workflow.

Phase 78 does not reinvent verification, drift detection, reconciliation, degraded-mode policy, or execution proof. It composes those outputs into one first-class phase truth artifact and governs recent backfill plus future ongoing generation.

</domain>

<decisions>
## Implementation Decisions

### Canonical artifact format
- Every governed phase must produce a paired truth artifact:
  - `.planning/phases/<N>-<slug>/<N>-TRUTH.yaml`
  - `.planning/phases/<N>-<slug>/<N>-TRUTH.md`
- `TRUTH.yaml` is the authoritative machine contract.
- `TRUTH.md` is a rendered human-facing projection of the machine artifact.
- Manual edits may add commentary in the markdown companion, but manual content is never authoritative input for status derivation.

### Contract role
- Phase truth is a new phase-level synthesis contract.
- `VERIFICATION.md` remains verification-specific and is not extended into the phase truth artifact.
- `SUMMARY.md` remains execution-history output.
- Drift and reconciliation artifacts remain the canonical contradiction and downgrade inputs.
- Phase truth references lower-level truth sources rather than duplicating raw evidence or becoming a second verifier.

### Generation model
- Phase truth is generated from existing truth artifacts, never manually declared.
- Canonical direct command:
  - `gsd:phase-truth generate <phase>`
- Generation may also be triggered by workflow hooks after verification, after reconciliation affecting a phase, and at phase-completion gates.
- Direct invocation remains mandatory even when hooks exist.

### Scope model
- The artifact is per-phase, not milestone-global.
- Each phase truth artifact is derived from:
  - per-plan summaries
  - phase verification artifact
  - drift findings affecting the phase
  - reconciliation outcomes affecting the phase
  - degraded-state caveats affecting truth-bearing interpretation
- Milestone-level aggregation is explicitly out of scope for Phase 78.

### Implementation order
- Required order:
  1. schema and artifact contract
  2. deterministic derivation logic
  3. CLI command and workflow wiring
  4. limited backfill for phases 70-77
- Generation must not be wired before schema and derivation semantics are locked.

### Backfill policy
- Phase 78 backfills phases `70` through `77`.
- Backfill is tolerant of legacy unevenness and old artifact shapes.
- Missing historical inputs become explicit gaps; they must not be papered over.
- New phases going forward are held to the full strict contract.
- Full-project historical retrofit is out of scope.

### Existing artifact boundaries
- Phase 78 adds a new artifact family.
- It does not redesign:
  - `SUMMARY.md`
  - `VERIFICATION.md`
  - `VALIDATION.md`
- Existing artifact families remain specialized; phase truth sits above them.

### Gap semantics
- `gaps` means any unresolved truth caveat that prevents unconditional phase closure.
- Gap classes must include:
  - evidence gaps
  - execution drift
  - verification drift
  - reconciliation-induced downgrades
  - operator escalations
  - degraded-state caveats
  - unresolved human-decision dependencies
- The artifact must not imply completeness by omitting these categories.

### Final validity scope
- Final validity is phase-local.
- Applied reconciliation affecting the phase is binding and can downgrade the artifact after local verification previously reported `VALID`.
- Local evidence remains the primary input, but current applied reconciliation and active drift affecting the phase must be incorporated.

### Deterministic precedence
- Final status values are restricted to:
  - `VALID`
  - `CONDITIONAL`
  - `INVALID`
- Precedence order, strongest to weakest:
  1. applied reconciliation affecting the phase
  2. current drift findings affecting the phase
  3. phase verification artifact
  4. plan summaries and proof-chain evidence
  5. degraded-state caveats affecting truth interpretation
- `INVALID` when any invalidating reconciliation, verification invalidation, unresolved `CRITICAL` drift, broken required proof chain, or missing required truth-bearing evidence exists.
- `CONDITIONAL` when no invalid condition exists but unresolved gaps, pending escalation, limiting degraded-state caveats, or unresolved `MAJOR` drift remain.
- `VALID` only when all claimed outcomes are backed, no unresolved gaps remain, no downgrade applies, and no degraded truth caveat limits certainty.

### Dependency model
- Normative derivation inputs:
  - Phase 71 proof-chain outputs
  - Phase 72 verification artifacts
  - Phase 73 drift findings affecting the phase
  - Phase 74 reconciliation affecting the phase
  - Phase 75 degraded-state artifact affecting truth posture
- Phase 77 governance boundaries are contextual and informative, not direct derivation inputs unless they produce applied state consumed by one of the normative artifacts above.

### Validation posture
- Phase 78 must ship validator coverage now.
- Required validation surfaces:
  - schema validation
  - derivation validation
  - update-trigger validation
- Authority signing is deferred and not required for first delivery.

### Downstream contract
- Phase 79 depends on more than file shape.
- Phase 78 must deliver:
  - standard artifact shape
  - deterministic derivation semantics
  - validator behavior
  - update triggers

### Claude's Discretion
- Exact YAML field layout so long as it preserves the locked authoritative fields and derivation semantics
- Whether markdown rendering is template-based or generated inline by a helper
- Exact naming and placement of helper modules and tests so long as the contract remains centralized and deterministic

</decisions>

### Unresolved Ambiguities

- None. Artifact format, derivation precedence, backfill scope, validator posture, and command ownership are locked.

### Interpreted Assumptions

- Existing phase directories from 70-77 contain enough structured summaries and verification surfaces to support honest backfill with explicit gaps rather than fabricated certainty.
- The machine artifact should remain YAML because the repo already supports YAML-safe authority envelopes for machine truth artifacts, even though signing is deferred in this phase.

<specifics>
## Specific Ideas

- Verification proves; phase truth synthesizes.
- Phase truth is derived, not declared.
- The machine artifact is the only source of truth; markdown is a view.
- A phase can look locally valid and still become conditionally or fully downgraded by later reconciliation; the artifact must tell the truth about that.
- Backfill should preserve continuity across the truth-hardening milestone without pretending the entire repo history was already normalized.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — milestone evidence, verification, drift, and truth-governance rules
- `.planning/REQUIREMENTS.md` — especially `TRUTH-PHASE-01` and `TRUTH-VERIFY-01`
- `.planning/ROADMAP.md` — official Phase 78 scope and dependency position
- `.planning/STATE.md` — current reconciled truth posture and drift markers

### Normative Upstream Phase Outputs
- `.planning/phases/71-execution-proof-chain/71-CONTEXT.md` — proof-chain contract that phase truth must consume rather than duplicate
- `.planning/phases/72-verification-hardening/72-CONTEXT.md` — evidence-first verification rules and status contract
- `.planning/phases/74-state-reconciliation-layer/74-CONTEXT.md` — reconciliation mutation and downgrade rules
- `.planning/phases/75-degraded-mode-enforcement/75-CONTEXT.md` — degraded-state policy and truth-bearing caveat contract
- `.planning/phases/77-execution-surface-governance/77-CONTEXT.md` — phase boundary immediately preceding phase truth standardization

### Canonical Runtime Artifacts
- `.planning/drift/latest-report.json` — current drift report surface
- `.planning/drift/latest-reconciliation.json` — current applied reconciliation artifact
- `.planning/health/latest-degraded-state.json` — current degraded truth artifact

### Existing Code Surfaces
- `get-stuff-done/bin/lib/verify.cjs` — verification artifact parsing and status enforcement
- `get-stuff-done/bin/lib/drift-engine.cjs` — latest drift artifact handling
- `get-stuff-done/bin/lib/drift-reconcile.cjs` — applied reconciliation artifact and downgrade matrix
- `get-stuff-done/bin/lib/degraded-mode.cjs` — degraded truth posture surface
- `get-stuff-done/bin/lib/phase.cjs` — phase file and artifact discovery helpers
- `get-stuff-done/bin/gsd-tools.cjs` — CLI surface where generation and validation commands should be wired

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verify.cjs` already parses structured markdown sections, status tables, and drift JSON blocks, which can inform phase-truth input extraction and validation style.
- `drift-reconcile.cjs` already defines the authoritative downgrade matrix and persisted reconciliation artifact path.
- `degraded-mode.cjs` already exposes a canonical degraded-state artifact and workflow-facing truth posture.
- `phase.cjs` already centralizes phase discovery and plan/summary indexing logic that can support per-phase source enumeration.

### Established Patterns
- The repo uses machine-readable frontmatter or structured artifacts paired with operator-readable markdown summaries.
- The truth-hardening phases separate evidence generation, contradiction detection, downgrade application, and operator policy rather than collapsing them into one file.
- Existing verification and summary artifacts prefer explicit statuses and references over inferred narrative.

### Integration Points
- Phase truth should read phase-local summaries and verification artifacts, then overlay current drift, reconciliation, and degraded-state consequences affecting that phase.
- Generation belongs behind a dedicated CLI command and may be invoked from existing completion and reconciliation flows.
- Backfill should target phases 70-77 because those are the truth-hardening phases whose outputs form the first coherent contract family.

</code_context>

<deferred>
## Deferred Ideas

- Milestone-level truth aggregation belongs to a later phase or closeout surface.
- Authority signing of phase-truth artifacts is deferred until after the base contract and validators are established.
- Adversarial end-to-end consumption of the new artifact family belongs to Phase 79.

</deferred>

---

*Phase: 78-phase-truth-contracts*
*Context gathered: 2026-03-27*

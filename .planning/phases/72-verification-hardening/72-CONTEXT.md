# Phase 72: Verification Hardening - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 72 replaces narrative verification with an evidence-only verification contract. It defines the hardened `VERIFICATION.md` structure, the requirement-level proof rules, the anti-pattern enforcement posture, the minimum drift tagging required during verification, and the structured escalation contract for cases where human meaning resolution is needed.

This phase does not yet implement the full drift severity engine or reconciliation layer. It hardens verification so later phases can classify and act on inconsistencies without reinterpreting prose.

</domain>

<decisions>
## Implementation Decisions

### Verification status model
- Phase 72 uses a mandatory three-state truth model:
  - `VALID`
  - `CONDITIONAL`
  - `INVALID`
- Legacy statuses map as:
  - `passed` -> `VALID`
  - `gaps_found` -> `CONDITIONAL`
  - `human_needed` -> `CONDITIONAL` with structured escalation
- If any requirement row is `INVALID`, final verification status must be `INVALID`.
- If no requirement is `INVALID` but any requirement has missing evidence, unresolved escalation, or documented evidence gaps, final verification status must be `CONDITIONAL`.
- `VALID` is allowed only when:
  - all requirements are `VALID`
  - no escalation remains pending
  - no unresolved drift remains in the artifact

### Human escalation model
- `human_needed` is removed as a verification status.
- Human involvement is represented through a structured escalation block:
  - `required`
  - `type`
  - `reason`
  - `explanation`
  - `options`
  - `implications`
- Allowed escalation types include:
  - `semantic_ambiguity`
  - `missing_evidence`
  - `conflicting_sources`
- Escalation never counts as evidence and never upgrades truth status by itself.
- Escalation does not block execution mechanically, but it blocks `VALID` status until resolved with evidence.

### Requirement coverage evidence standard
- Every requirement row must cite at least one direct evidence source:
  - commit hash
  - file reference
  - test command with output
  - runtime output
- Summary documents are never evidence by themselves.
- Summaries may only reference lower-level proof artifacts.
- A requirement may be `CONDITIONAL` only when the artifact explicitly records:
  - `gap.description`
  - `gap.missing_evidence`
- If evidence is insufficient and no explicit gap is recorded, the requirement is `INVALID`.

### Manual and human verification rules
- Human observation alone is never evidence.
- Manual verification is valid only when it produces a captured artifact through a structured `human_check` record containing:
  - `steps`
  - `observed_result`
  - `captured_artifact`
- Manual validation with captured artifact may support `VALID`.
- Manual validation without captured artifact is `CONDITIONAL`.
- Manual validation required but not yet performed is `CONDITIONAL`.

### Anti-pattern scan policy
- Phase 72 uses a two-tier anti-pattern model.
- Automatic blockers, which force `INVALID`, include:
  - mocked logic presented as real
  - fake or bypass execution paths
  - unimplemented critical branches
  - placeholder logic affecting real execution
- Degraders, which force at least `CONDITIONAL`, include:
  - `TODO`
  - `FIXME`
  - stubs
  - dead code outside the critical execution path
- Anti-pattern blockers override all other signals and force final status `INVALID`.
- Out-of-scope or explicitly grandfathered legacy findings must be recorded as non-blocking historical drift rather than treated as current-phase blockers.

### Verification artifact scope
- Mandatory verification sections are:
  - `Observable Truths`
  - `Requirement Coverage`
  - `Anti-Pattern Scan`
  - `Drift Analysis`
  - `Final Status`
- Old `Required Artifacts` content is folded into `Observable Truths`.
- Old `Key Link Verification` content is folded into `Requirement Coverage`.
- Old `Gaps Summary` content is embedded at the requirement level.
- Fix-plan generation is removed from `VERIFICATION.md`.
- Verification artifacts remain purely evidentiary and must not become repair-planning documents.

### Drift analysis depth
- Phase 72 requires active drift tagging now; placeholder drift sections are not allowed.
- Each inconsistency found during verification must be classified as one of:
  - `spec_drift`
  - `implementation_drift`
  - `verification_drift`
  - `execution_drift`
- Phase 72 requires drift classification but not drift severity; severity handling is deferred to later phases.

### Claude's Discretion
- Exact markdown and frontmatter shape for the hardened `VERIFICATION.md` template
- Exact representation of per-row evidence references and gap blocks
- Whether escalation and human-check records live in frontmatter, body tables, fenced YAML blocks, or a mixed format, so long as they remain structured and machine-parseable

</decisions>

### Unresolved Ambiguities

- None. Phase-defining verification, evidence, escalation, and anti-pattern decisions are locked.

### Interpreted Assumptions

- None. Human escalation is formalized as a decision surface and never treated as proof.

<specifics>
## Specific Ideas

- Narrative is never evidence. Humans can validate meaning, not create truth.
- Verification must become evidence-only, not “looks correct.”
- A summary can point to proof, but it cannot become proof.
- Escalation is a structured operator decision surface, not a truth source.
- Verification should record inconsistencies now so later phases can classify and reconcile them mechanically.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — locked evidence, verification, drift, degraded-mode, and authority rules
- `.planning/PROJECT.md` — active milestone framing for `v0.7.0`
- `.planning/REQUIREMENTS.md` — Phase 72 requirements, especially `TRUTH-VERIFY-01` and `TRUTH-VERIFY-02`
- `.planning/ROADMAP.md` — official Phase 72 scope and dependency position

### Upstream Phase Outputs
- `.planning/phases/70-drift-surface-mapping/70-CONTEXT.md` — drift surface inventory and authority ordering
- `.planning/phases/71-execution-proof-chain/71-CONTEXT.md` — proof-chain model that verification must consume rather than reinterpret

### Existing Verification Surfaces
- `get-stuff-done/templates/verification-report.md` — legacy narrative verification template that Phase 72 must replace
- `get-stuff-done/bin/lib/verify.cjs` — existing verification engine and integrity logic
- `get-stuff-done/bin/lib/commands.cjs` — verification artifact creation path
- `.planning/phases/55-open-brain-v1-foundations/55-VERIFICATION.md` — recent verification artifact example to harden beyond narrative posture

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `get-stuff-done/templates/verification-report.md` already provides a sectioned verification artifact and can be hardened rather than replaced from nothing.
- `get-stuff-done/bin/lib/verify.cjs` already contains verification-oriented logic and is the natural enforcement point for evidence validation, anti-pattern scanning, and drift tagging.
- `get-stuff-done/bin/lib/commands.cjs` already knows how verification artifacts are emitted and will likely need template and status-contract updates.

### Established Patterns
- The repo already uses machine-readable frontmatter plus markdown body sections for planning artifacts.
- Summary and verification artifacts already contain structured references, but the current evidence standard is too permissive for `v0.7.0`.
- Requirement coverage and evidence references already exist in practice, but they are not yet mandatory, uniformly structured, or enforced.

### Integration Points
- Phase 72 should consume Phase 71 proof artifacts instead of inventing parallel proof sources.
- The hardened verification output must become direct input to later drift detection and reconciliation phases.
- Escalation output must remain machine-readable so operator surfaces and later phases can distinguish unresolved meaning from proven truth.

</code_context>

<deferred>
## Deferred Ideas

- Drift severity assignment belongs to later phases.
- Deterministic status downgrade and reconciliation behavior belong to Phase 74.
- Repair-plan generation should live outside `VERIFICATION.md` in later repair-oriented flows.

</deferred>

---

*Phase: 72-verification-hardening*
*Context gathered: 2026-03-27*

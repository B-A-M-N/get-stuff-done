# Phase 76: Enforcement Boundary Audit - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 76 audits the full truth-enforcement surface to prove that critical truth-bearing flows cannot bypass required validators, sanctioned writers, or proof-bearing execution interfaces. It must enumerate authoritative mutation and truth-claim paths across CLI routes, internal libraries, and direct file-write surfaces, then classify any bypasses with enough detail to prove whether a critical path is actually exploitable.

Phase 76 is an audit phase, not a narrowing or ergonomics phase. It should detect and prove bypasses, define the sanctioned interface contract explicitly, and leave enforcement shaping for later phases.

</domain>

<decisions>
## Implementation Decisions

### Audit scope
- Phase 76 audits all paths that can mutate or assert authoritative truth:
  - CLI entrypoints
  - internal library calls
  - direct file-write paths
  - sanctioned and unsanctioned mutation surfaces
- If a path can affect authoritative truth, it is in scope regardless of how it is invoked.

### Canonical bypass types
- Every finding must classify as one of:
  - `validator_bypass`
  - `writer_bypass`
  - `execution_bypass`
  - `truth_claim_bypass`
- Meanings:
  - `validator_bypass`
    - required validators were not executed before a truth-bearing action
  - `writer_bypass`
    - authoritative artifacts were written outside sanctioned writers
  - `execution_bypass`
    - authoritative state mutated without the required proof chain
  - `truth_claim_bypass`
    - the system asserted healthy, valid, complete, or equivalent truth without current evidence

### Authoritative artifact set
- Phase 76 treats the following as truth-bearing surfaces:
  - `.planning/STATE.md`
  - `.planning/ROADMAP.md` status and phase-state surfaces
  - `*-VERIFICATION.md`
  - `*-SUMMARY.md`
  - `.planning/drift/latest-report.json`
  - `.planning/drift/latest-reconciliation.json`
  - `.planning/health/latest-degraded-state.json`
  - phase status metadata consumed by CLI and state readers
- Writes to these surfaces must only occur through sanctioned interfaces.

### Output artifacts
- Machine source of truth:
  - `.planning/audit/enforcement-boundary.json`
- Human synthesis:
  - `.planning/phases/76-enforcement-boundary-audit/76-VERIFICATION.md`
- The machine artifact is authoritative; the markdown artifact is explanatory.

### Finding schema
- Each finding must include:
  - `type`
  - `severity`
  - `location`
  - `surface`
  - `path`
  - `repro`
- Binary present or absent output is insufficient.

### Severity model
- Reuse:
  - `CRITICAL`
  - `MAJOR`
  - `MINOR`
- `CRITICAL` findings include:
  - writer bypass on authoritative artifacts
  - truth-claim bypass claiming valid, complete, or healthy truth without evidence
  - validator bypass on required truth transitions
  - execution bypass that skips the proof chain
- Any `CRITICAL` bypass blocks Phase 76 completion.

### Detection basis
- Detection must combine:
  - static scan of code paths and file writes
  - targeted runtime probes for critical surfaces
- A critical bypass must be proven possible or proven impossible.

### Sanctioned interface source of truth
- Phase 76 declares sanctioned interfaces explicitly in:
  - `.planning/policy/sanctioned-interfaces.yaml`
- This file defines:
  - allowed writers per authoritative artifact
  - approved call sequences for truth transitions
- Sanctioned interfaces are declared, not inferred.

### Required validator source of truth
- Phase 76 declares required validators explicitly in:
  - `.planning/policy/required-validators.yaml`
- This file defines minimum validator coverage for truth-bearing actions.
- Missing a required validator is a `validator_bypass`.

### Write-surface boundary
- Audit all writes to authoritative artifacts, not only operator-facing commands.
- Internal library writes are allowed only if they route through sanctioned helpers.
- Arbitrary direct fs writes into authoritative surfaces are disallowed.

### Phase 75 interaction
- Phase 76 is a superset audit and must include whether Phase 75 degraded-mode blocking can be bypassed through alternate paths.
- It covers the whole repo governance surface, not only degraded-mode routes.

### Completion gate
- Phase 76 is complete only when:
  - there are zero `CRITICAL` bypasses
  - all findings are classified and documented
  - the machine audit artifact exists
  - sanctioned interface policy exists
  - required validator policy exists
  - targeted runtime probes cover critical authoritative surfaces
  - `76-VERIFICATION.md` proves no critical bypass remains

### Claude's Discretion
- Exact JSON schema field names inside `.planning/audit/enforcement-boundary.json`
- Exact code organization for static scanners and runtime probe helpers
- Exact call-chain representation so long as it remains deterministic and machine-readable

</decisions>

### Unresolved Ambiguities

- None. Scope, bypass types, artifact set, severity rules, and completion criteria are locked for planning.

### Interpreted Assumptions

- None. The audit boundary and evidence expectations are explicit.

<specifics>
## Specific Ideas

- Phase 75 established fail-closed behavior.
- Phase 76 proves that behavior cannot be sidestepped through alternate code paths.
- This phase exists to prove the system cannot lie by taking the wrong route, not to reshape operator ergonomics.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — truth enforcement and bypass rules
- `.planning/REQUIREMENTS.md` — especially `TRUTH-BYPASS-01` and `TRUTH-CLAIM-01`
- `.planning/ROADMAP.md` — official Phase 76 goal
- `.planning/STATE.md` — current authoritative state surface

### Upstream Phase Outputs
- `.planning/phases/72-verification-hardening/72-CONTEXT.md` — hardened verification truth contract
- `.planning/phases/73-drift-detection-engine/73-CONTEXT.md` — drift truth inputs
- `.planning/phases/74-state-reconciliation-layer/74-CONTEXT.md` — sanctioned reconciliation mutation boundary
- `.planning/phases/75-degraded-mode-enforcement/75-CONTEXT.md` — degraded-mode enforcement surface that Phase 76 must audit for bypasses
- `.planning/health/latest-degraded-state.json` — current degraded-state artifact
- `.planning/drift/latest-reconciliation.json` — current applied reconciliation artifact

### Existing Code Surfaces
- `get-stuff-done/bin/gsd-tools.cjs` — top-level truth-bearing command routes
- `get-stuff-done/bin/lib/verify.cjs` — verification and integrity truth-claim surfaces
- `get-stuff-done/bin/lib/state.cjs` — authoritative state mutation surface
- `get-stuff-done/bin/lib/roadmap.cjs` — roadmap status mutation surface
- `get-stuff-done/bin/lib/commands.cjs` — operator-facing state and degraded surfaces
- `get-stuff-done/bin/lib/degraded-mode.cjs` — current degraded-policy enforcement inputs
- `get-stuff-done/bin/lib/authority.cjs` — signature and sanctioned artifact trust envelope layer

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `authority.cjs` already provides the signature envelope contract for authoritative artifacts.
- `verify.cjs`, `state.cjs`, and `roadmap.cjs` already represent sanctioned truth-bearing interfaces.
- `gsd-tools.cjs` already centralizes many operator entrypoints and verification commands.

### Established Patterns
- Phase 71 established proof-chain expectations for execution summaries.
- Phase 72 established evidence-first verification requirements.
- Phase 75 established fail-closed blocking for unsafe truth-bearing workflows.

### Integration Points
- Phase 76 should enumerate authoritative writers and validators from current sanctioned modules instead of creating implicit policy.
- Runtime probes should target the same CLI and library surfaces that later governance phases will rely on.
- The audit artifact should become input for later governance narrowing and gauntlet phases.

</code_context>

<deferred>
## Deferred Ideas

- Enforcement narrowing and ergonomics belong to Phase 77.
- Phase-level truth contract standardization belongs to Phase 78.
- Full adversarial integrity gauntlet belongs to Phase 79.

</deferred>

---

*Phase: 76-enforcement-boundary-audit*
*Context gathered: 2026-03-27*

<!-- GSD-AUTHORITY: 76-00-0:37f78d1793808bced847827474ca880525cfd5d1c70667e1c9a6b32345e10e50 -->

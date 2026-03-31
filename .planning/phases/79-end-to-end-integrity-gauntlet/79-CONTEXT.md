# Phase 79: End-to-End Integrity Gauntlet - Context

**Gathered:** 2026-03-27
**Status:** Ready for research and planning

<domain>
## Phase Boundary

Phase 79 is the hostile end-to-end proof phase for the `v0.7.0` truth-enforcement milestone. It must validate the full truth-enforcement stack under adversarial failure conditions before milestone closeout and prove that the system cannot accept, project, or preserve invalid truth when execution evidence, verification evidence, drift state, or degraded subsystem state is corrupted or incomplete.

Phase 79 is not a generic QA pass, not a unit-test-only hardening pass, and not a lightweight release smoke test. It is a release-gating adversarial proof that traverses the full sanctioned truth path from execution through commit-backed proof, verification, memory truth, retrieval-facing truth posture, and governance.

</domain>

<decisions>
## Implementation Decisions

### Gauntlet scope boundary
- Phase 79 must exercise the entire truth-enforcement stack end-to-end.
- Mandatory included surfaces:
  - Phase 76 enforcement-boundary outputs and sanctioned truth-bearing interfaces
  - Phase 77 governance routing and command consequence classification
  - Phase 78 phase-truth generation and update hooks
  - Second Brain truth surfaces, including canonical Postgres-backed behavior and degraded SQLite signaling
  - Firecrawl context path where degraded-mode and truth posture affect authoritative context use
  - Plane integration paths when Plane is configured
  - sanctioned CLI surfaces including `complete-task`, `verify-integrity`, and authoritative context-build flows
- The phase must traverse the full chain:
  - input -> execution -> commit -> verification -> memory -> retrieval-facing truth posture -> governance
- Explicitly out of scope:
  - UI-only surfaces that do not affect truth propagation
  - Open Brain unless it is wired into an authoritative truth or enforcement path

### Authoritative validation surface
- Primary proof surface is end-to-end CLI behavior plus emitted artifacts.
- Required primary flows:
  - phase execution flows
  - task completion flows
  - integrity verification flows
  - authoritative truth-generation and truth-consumption flows
- Internal hooks may be used only to seed failure conditions or support deterministic injection.
- Unit-level coverage may support implementation but does not count as gauntlet proof.

### Failure injection model
- Phase 79 uses a controlled corruption harness with four mandatory tiers:
  - Tier A: artifact corruption
  - Tier B: CLI misuse
  - Tier C: subsystem degradation
  - Tier D: state-drift injection
- Tier A must support corruption of:
  - `SUMMARY.md`
  - `VERIFICATION.md`
  - commit references
  - checkpoint chains
  - any truth-bearing supporting artifact required by the scenario
- Tier B must support misuse such as:
  - skipping required primitives
  - reordering sanctioned calls
  - claiming partial execution as completion
  - attempting fake success output without proof
- Tier C must support degraded subsystem scenarios including:
  - Postgres unavailable with SQLite fallback or degraded memory posture
  - Firecrawl unavailable
  - Plane disconnected or stale when configured
- Tier D must support contradictions such as:
  - memory truth vs filesystem truth
  - summary claims vs git history
  - retrieval-facing truth posture vs underlying ground truth
- Mock-only simulation is prohibited.
- Injection must not bypass the enforcement boundary to create impossible test conditions.

### Pass and fail semantics
- Every gauntlet scenario must resolve to one authoritative outcome class:
  - `INVALID`
  - `CONDITIONAL`
  - `RECONCILIATION_REQUIRED`
  - `BLOCK`
- Mapping rules:
  - proven evidence conflict -> `INVALID`
  - missing required artifact -> `INVALID`
  - skipped enforcement step -> `INVALID`
  - declared degraded subsystem with correct surfaced consequences -> `CONDITIONAL`
  - undeclared degraded subsystem -> `INVALID`
  - drift detected that requires canonical downgrade work -> `RECONCILIATION_REQUIRED`
  - partial execution presented as complete -> `INVALID`
  - integrity not provable enough to continue authoritative progression -> `BLOCK`
- Truth violations must never degrade to warnings.
- Warnings are allowed only for optional or non-truth-critical concerns such as performance or non-authoritative optional subsystems.

### Mandatory output artifacts
- Phase 79 must produce all of the following artifacts:
  - `79-01-PLAN.md`
  - `79-GAUNTLET-SPEC.md`
  - `79-GAUNTLET-RESULTS.md`
  - `79-VERIFICATION.md`
  - `79-COVERAGE-MAP.md`
  - `79-DRIFT-REPORT.md`
- Optional supporting artifacts may include:
  - replay logs
  - artifact diff snapshots
  - failure traces
- Phase 79 cannot close without gauntlet results and a final verification artifact.

### Coverage depth
- Each failure class must include at least:
  - two single-failure scenarios
  - one mixed-failure scenario
- Required failure classes:
  - fake verification
  - missing commits
  - partial execution
  - degraded subsystem
  - drift or contradiction
- Minimum total scenario count is fifteen.
- At least three scenarios must be compositional multi-failure chains.

### Runtime posture
- Phase 79 must support dual execution modes:
  - deterministic local mode
  - live integration mode when real services are available
- Deterministic local mode is required for CI and reproducible adversarial proofs.
- Live integration mode should exercise real Postgres, Firecrawl, and Plane paths when available.
- Degraded truth behavior must match between deterministic and live modes.
- If outcome classification differs between modes for the same seeded failure semantics, the system is inconsistent and the result is invalidating.

### Milestone closeout threshold
- Phase 79 is a hard release gate for milestone `v0.7.0`.
- Required pass conditions:
  - all required scenarios executed
  - zero unclassified outcomes
  - zero false positives where invalid state is accepted
  - zero silent failures
  - all degraded conditions surfaced explicitly
- Known failures are allowed only when all are true:
  - documented
  - reproducible
  - severity-classified
  - non-critical to the truth guarantees being gated
- Absolute milestone blockers:
  - undetected corruption
  - invalid state accepted as valid
  - enforcement-boundary bypass
  - silent degradation

### Artifact and harness philosophy
- Phase 79 is an adversarial proof, not a best-effort confidence exercise.
- Artifact output must preserve raw scenario evidence and final truth classification separately.
- The gauntlet spec defines scenario intent and expected classification.
- The gauntlet results artifact records actual execution, observed outputs, and emitted artifacts.
- Verification makes the final truth judgment over the completed gauntlet.
- Drift findings discovered by the gauntlet must be written to a dedicated drift report rather than buried in narrative.

### Claude's Discretion
- Exact file and module placement for the corruption harness, scenario fixtures, and reusable helpers
- Exact command names for any new gauntlet-oriented internal helper surfaces, provided the primary validation surface remains CLI E2E
- Exact representation of scenario catalogs, replay logs, and raw execution traces so long as scenario definitions, observed evidence, and final outcome classification remain deterministic and auditable

</decisions>

### Unresolved Ambiguities

- None. Scope, proof surface, failure injection model, outcome classes, artifact ownership, coverage depth, runtime posture, and milestone gate semantics are locked for planning.

### Interpreted Assumptions

- Existing truth-hardening phases already provide enough sanctioned surfaces and artifacts that the gauntlet can attack the real system rather than a synthetic test-only facade.
- Any currently missing helper for deterministic corruption or replay may be added in support of the gauntlet, but it must feed the authoritative CLI path rather than replace it.

<specifics>
## Specific Ideas

- Phase 79 is a hostile proof that the system cannot lie even when attacked internally.
- The authoritative result is externally visible behavior plus emitted truth artifacts, not unit-test confidence.
- Mixed-failure chains matter because real integrity failures compound rather than arriving one at a time.
- The release gate is specifically about preventing false acceptance, hidden downgrade, or unprovable truth progression.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — authoritative milestone thesis, evidence standard, drift rules, degraded-mode policy, and bypass definition
- `.planning/REQUIREMENTS.md` — especially `TRUTH-GAUNTLET-01`, `TRUTH-DRIFT-02`, `TRUTH-DEGRADE-01`, and `TRUTH-BYPASS-01`
- `.planning/ROADMAP.md` — official Phase 79 scope, dependency, and roadmap wording
- `.planning/STATE.md` — current truth posture, milestone progress, and final-phase readiness

### Normative Upstream Phase Contracts
- `.planning/phases/76-enforcement-boundary-audit/76-CONTEXT.md` — sanctioned writers, validator boundaries, bypass classes, and authoritative artifact set
- `.planning/phases/77-execution-surface-governance/77-CONTEXT.md` — governance classes, hard-gated truth transitions, recovery-only boundaries, and operator-facing consequence rules
- `.planning/phases/78-phase-truth-contracts/78-CONTEXT.md` — phase-truth synthesis rules, derivation precedence, and update-trigger contract
- `.planning/phases/78-phase-truth-contracts/78-RESEARCH.md` — implementation guidance for the immediately preceding truth artifact layer once present

### Canonical Runtime Truth Artifacts
- `.planning/drift/latest-report.json` — current drift report surface that gauntlet scenarios may contradict or force to update
- `.planning/drift/latest-reconciliation.json` — current applied reconciliation artifact and downgrade semantics
- `.planning/health/latest-degraded-state.json` — canonical degraded truth posture consumed by governance and truth-bearing workflows
- `.planning/audit/enforcement-boundary.json` — authoritative enforcement boundary machine artifact produced by Phase 76
- `.planning/policy/sanctioned-interfaces.yaml` — sanctioned writer and call-sequence policy for truth-bearing artifacts
- `.planning/policy/required-validators.yaml` — minimum validator requirements for truth-bearing actions
- `.planning/policy/command-governance.yaml` — route governance map defining warn, block, recovery, and ungated behavior

### Existing Code Surfaces
- `get-stuff-done/bin/gsd-tools.cjs` — top-level CLI entry surface for authoritative end-to-end proof execution
- `get-stuff-done/bin/lib/commands.cjs` — command implementations and truth-affecting operator paths
- `get-stuff-done/bin/lib/verify.cjs` — integrity verification, verification artifact enforcement, and truth judgment helpers
- `get-stuff-done/bin/lib/phase.cjs` — phase completion, phase-local artifact discovery, and summary wiring
- `get-stuff-done/bin/lib/state.cjs` — authoritative project state mutation surface
- `get-stuff-done/bin/lib/roadmap.cjs` — roadmap mutation and phase-state update surface
- `get-stuff-done/bin/lib/second-brain.cjs` — canonical memory truth layer and fallback posture
- `get-stuff-done/bin/lib/firecrawl-client.cjs` — external context boundary and failure posture input
- `get-stuff-done/bin/lib/plane-client.cjs` — Plane integration contract for configured environments
- `get-stuff-done/bin/lib/checkpoint-plane-sync.cjs` — truth-adjacent Plane sync behavior for checkpoint and summary paths
- `get-stuff-done/bin/lib/degraded-mode.cjs` — canonical degraded-state computation and route-impact logic
- `get-stuff-done/bin/lib/phase-truth.cjs` — authoritative phase-truth derivation and artifact generation contract
- `get-stuff-done/bin/lib/context.cjs` — authoritative context build surfaces that must respect truth and degraded posture

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verify.cjs` already owns the strongest evidence-first verification surfaces and should remain the authoritative judge for verification-related corruption scenarios.
- `phase-truth.cjs` already centralizes derived phase-truth generation and is the correct truth artifact layer for final status propagation scenarios.
- `degraded-mode.cjs` already models degraded and unsafe posture, making it the natural authority for declared-vs-undeclared degradation scenarios.
- `second-brain.cjs` already exposes canonical-vs-fallback memory behavior and is the critical memory-truth surface for Postgres/SQLite mismatch cases.
- `gsd-tools.cjs` and `commands.cjs` already expose sanctioned CLI routes, which makes them the correct primary execution surface for end-to-end adversarial proofs.

### Established Patterns
- Truth-bearing state is represented through machine-readable artifacts plus operator-facing projections rather than narrative-only status.
- New truth contracts in this milestone separate source evidence, contradiction detection, downgrade application, and final truth reporting instead of collapsing those concerns together.
- Blocking integrity failures are expected to stop truth-bearing flows rather than emit soft warnings.
- Phase artifacts are phase-local and deterministic, with dedicated summary and verification outputs rather than generic logs standing in for proof.

### Integration Points
- Phase 79 should execute sanctioned CLI flows, seed realistic corruption, and assert on the resulting truth artifacts and exit behavior without replacing the real enforcement path.
- The corruption harness must integrate with phase summaries, verification artifacts, state mutation, degraded-state evaluation, and memory truth without introducing a second non-authoritative enforcement model.
- Live-mode gauntlet runs should plug into the same Plane, Firecrawl, and Postgres configuration surfaces the repo already uses so discrepancies between deterministic and live behavior are measurable.

</code_context>

<deferred>
## Deferred Ideas

- Broad UI or operator-experience polish beyond truth-surface observability belongs to later milestones.
- Open Brain adversarial validation remains out of scope unless future work promotes it into an authoritative truth-bearing path.
- Any larger post-`v0.7.0` resilience or chaos-engineering framework belongs to a later milestone once this release-gating gauntlet exists.

</deferred>

---

*Phase: 79-end-to-end-integrity-gauntlet*
*Context gathered: 2026-03-27*

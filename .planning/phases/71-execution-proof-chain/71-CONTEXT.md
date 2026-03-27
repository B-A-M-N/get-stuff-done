# Phase 71: Execution Proof Chain - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 71 establishes the proof system that turns completed execution into mechanically provable truth. It does not yet classify drift or reconcile inconsistency. It defines and enforces how tasks, commits, changed files, runtime evidence, proof logs, and summaries connect so later phases can verify and audit execution without narrative gaps.

The phase scope is proof production and proof enforcement for new execution, plus limited backfill continuity for recent critical phases. It is not a broad historical rewrite.

</domain>

<decisions>
## Implementation Decisions

### Authority model
- Proof must be derived from execution reality, not coordination systems.
- Authority is split hard:
  - Git is authoritative for execution truth and changed-file truth.
  - Runtime and CLI behavior are authoritative for behavioral proof.
  - Plane is coordination-only and is never valid proof.
- If Plane and Git/runtime disagree, Plane is wrong for proof purposes.

### Proof unit boundary
- Phase 71 uses a mandatory **dual-layer** proof model.
- Tasks are the atomic proof unit.
- Plan summaries are structured proof indexes over task proof.
- Tasks produce proof; summaries index proof.

### Sufficient task proof
- Every completed task always requires:
  - commit hash
  - changed file set
- Execution, test, or log evidence is conditionally required when:
  - behavior changes
  - runtime or CLI behavior changes
  - output changes
- Non-behavioral tasks may be valid with commit + files only.

### Canonical file truth
- Git diff is canonical for what changed.
- Task logs are the intent and traceability layer.
- If task log and git disagree, git wins.

### Summary linkage contract
- Summary linkage must be structured, not just a list of hashes.
- The required linkage shape is:
  - task id
  - canonical commit
  - changed files
  - verification command
  - evidence reference
- Summaries remain the view/index layer, not the proof authority.

### No-code-change tasks
- “No code change required” is allowed only as a tightly controlled evidence exception.
- No-op tasks are valid only if they emit a proof artifact that maps:
  - existing files
  - commands run
  - runtime or artifact evidence
- Without that replacement proof artifact, a no-commit task is invalid.

### Multi-commit tasks
- Multi-commit tasks are allowed.
- Every multi-commit task must declare:
  - canonical proof commit
  - ancestor commits
- One canonical proof hash is always required.

### Runtime proof inclusion
- Installed/runtime proof is conditional, not universal.
- It becomes mandatory when the task affects:
  - CLI behavior
  - installed binaries
  - runtime environment
  - operator surfaces
- Repo-local proof alone is not enough for runtime-facing changes.

### Failure behavior
- Missing or invalid proof hard-fails execution.
- The system must still emit a failure artifact when proof validation fails.
- Hard fail does not mean silent stop; it means blocked progression with recorded failure evidence.

### Proof artifact format
- Phase 71 uses a mandatory **hybrid** artifact model.
- Primary proof artifact: `.proof/task-log.jsonl`
- Summary artifacts remain the human-readable/structured proof index layer.
- Machine log is the truth layer.
- Summary is the representation layer.

### Retroactive enforcement
- Enforcement is forward-moving with limited backfill.
- Required backfill scope:
  - Phase 70
  - recent critical phases 50-55
- Full historical rewrite is explicitly out of scope.

### Claude's Discretion
- Exact JSONL record field ordering and formatting inside `.proof/task-log.jsonl`
- Whether proof-index summary structure is added through frontmatter, body sections, or both
- Whether limited backfill is delivered in one narrow migration step or split across the two Phase 71 plans

</decisions>

### Unresolved Ambiguities

- None. The proof model, authority model, failure behavior, and artifact strategy are locked.

### Interpreted Assumptions

- None. Phase 71 decisions were made explicitly and are not being carried as planner inference.

<specifics>
## Specific Ideas

- “Proof must be derived from execution reality, not coordination systems.”
- “Git + runtime = truth. Plane = coordination.”
- “Tasks produce proof; summaries index proof.”
- “Machine log = truth, summary = representation.”
- “Hard fail missing proof, but still emit failure artifacts.”

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/v0.7.0-DECISIONS.md` — locked truth-enforcement rules, evidence standards, degraded-mode policy, and no-bypass constraints
- `.planning/PROJECT.md` — active milestone framing for `v0.7.0`
- `.planning/REQUIREMENTS.md` — Phase 71 requirements, especially `TRUTH-EXEC-01` and `TRUTH-CLAIM-01`
- `.planning/ROADMAP.md` — official Phase 71 boundary and dependency position

### Upstream Phase Outputs
- `.planning/phases/70-drift-surface-mapping/70-CONTEXT.md` — locked drift-surface definitions and authority ordering
- `.planning/phases/70-drift-surface-mapping/70-VERIFICATION.md` — verified outcome of the drift map
- `.planning/phases/70-drift-surface-mapping/drift_catalog.yaml` — current machine-truth inventory that Phase 71 proof must attach to
- `.planning/phases/70-drift-surface-mapping/70-DRIFT-SUMMARY.md` — active hotspots that Phase 71 must be able to prove or fail cleanly around

### Existing Execution and Summary Surfaces
- `get-stuff-done/workflows/execute-plan.md` — current task execution and summary flow
- `get-stuff-done/templates/summary.md` — current summary contract that must become a structured proof index
- `get-stuff-done/templates/verification-report.md` — downstream verification contract that Phase 71 should make easier to satisfy
- `get-stuff-done/bin/lib/commands.cjs` — commit-task, complete-task, task-log, summary extraction, and commit helpers
- `get-stuff-done/bin/lib/verify.cjs` — current task-log summary agreement and execution integrity checks

### Recent High-Value Continuity Targets
- `.planning/phases/50-plane-integration-observability/50-01-SUMMARY.md` — recent execution summary style worth backfill continuity
- `.planning/phases/55-open-brain-v1-foundations/55-04-SUMMARY.md` — recent operator-surface runtime proof style
- `.planning/phases/55-open-brain-v1-foundations/55-VERIFICATION.md` — evidence-first verification style Phase 71 should support

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `get-stuff-done/bin/lib/commands.cjs`: already owns `commit-task`, `complete-task`, and task-log writing, so proof enforcement should extend this path rather than create a parallel executor.
- `get-stuff-done/bin/lib/verify.cjs`: already has task-log and summary agreement checks plus integrity audit hooks that can be hardened into proof validation.
- `get-stuff-done/bin/gsd-tools.cjs`: already exposes commit-task, complete-task, task-log, verify-summary, and integrity surfaces that Phase 71 should extend.
- Existing per-plan `*-TASK-LOG.jsonl` files and tests in `tests/execution-path.test.cjs`, `tests/enforcement.test.cjs`, and `tests/workflow-scenario.test.cjs` provide current proof-adjacent behavior to build on.

### Established Patterns
- The repo already treats task logs as execution trace and summaries as post-execution documentation, but the linkage is weaker than the Phase 71 proof model requires.
- Summary/log agreement and ancestry checks already exist, which means Phase 71 should harden and formalize, not replace, those mechanisms.
- Installed/runtime truth can diverge from repo-local truth, so runtime-facing proof cannot be repo-only when operator surfaces change.

### Integration Points
- Phase 71 should produce machine-verifiable proof data that Phase 72 can consume during evidence-first verification.
- Phase 71 should emit failure artifacts that Phase 73 and Phase 74 can classify and reconcile without reinterpreting prose.
- Limited backfill for phases 50-55 and 70 should prove continuity without turning this phase into archaeology.

</code_context>

<deferred>
## Deferred Ideas

- Full drift detection remains Phase 73 work.
- Reconciliation and status downgrades remain Phase 74 work.
- Broad historical proof retrofits outside Phase 70 and recent critical phases remain out of scope.
- Plane-side coordination improvements remain separate from proof authority and should not be folded into this phase.

</deferred>

---

*Phase: 71-execution-proof-chain*
*Context gathered: 2026-03-27*

<!-- GSD-AUTHORITY: 71-00-0:e49d8b028766724a7f0f3c9185cf891a18969e01ca8a89eae124ec07618142cb -->

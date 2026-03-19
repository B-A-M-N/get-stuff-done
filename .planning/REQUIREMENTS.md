# Requirements: get-stuff-done

**Defined:** 2026-03-17
**Core Value:** Runtime-bound orchestration integrity — enforcement that cannot be bypassed by following a different workflow path

## v0.2 Requirements

### ENFORCE — Runtime Gate Enforcement

- [x] **ENFORCE-01**: Orchestrator refuses to proceed when `clarification_status: blocked` in STATE.md (applies to plan-phase, execute-phase, autonomous)
- [x] **ENFORCE-02**: `verify checkpoint-response` is a mandatory hard gate in execute-phase — wave cannot advance unless it passes
- [x] **ENFORCE-03**: `resume-project` routes to unblock flow when `clarification_status: blocked` rather than silently routing to execute/plan
- [x] **ENFORCE-04**: `autonomous` checks clarification_status per-phase and halts with explanation when blocked
- [x] **ENFORCE-05**: `verify research-contract` called as mandatory gate in `plan-phase` inline research path — not just in standalone `/gsd:research-phase` (audit found it is currently absent from plan-phase critical path)

### CHECKPOINT — Persistent Checkpoint Artifact

- [x] **CHECKPOINT-01**: Canonical CHECKPOINT.md written to phase directory on every blocking checkpoint
- [x] **CHECKPOINT-02**: CHECKPOINT.md re-read and validated by resume-project before routing continuation
- [x] **CHECKPOINT-03**: Checkpoint lifecycle tracked in STATE.md (pending / awaiting-response / resolved)
- [x] **CHECKPOINT-04**: `checkpointArtifactSchema` (Zod) defines the canonical shape of CHECKPOINT.md

### CONTEXT — Pre-flight Context Enrichment

- [x] **CONTEXT-01**: Before escalating clarification to user, system harvests STATE.md decisions, CONTEXT.md canonical_refs, and PLAN.md for auto-resolution candidates
- [x] **CONTEXT-02**: Clarification prompts include what was found in ambient state (pre-answered or narrowed questions)
- [x] **CONTEXT-03**: `discuss-seed` receives relevant ambient context fields alongside the narrative input
- [x] **CONTEXT-04**: ITL output (ambiguity score, lockability, clarification.mode) persisted to `{phase_dir}/{phase}-ITL.json` — currently lost when the discuss-phase session ends; plan-phase in a new window starts blind

### SURFACE — Workflow Surface Hardening

- [x] **SURFACE-01**: `research-phase` and `validate-phase` get blocked-state gate check at entry
- [x] **SURFACE-02**: `autonomous` gets per-phase blocked-state awareness and halts with a clear explanation and resume path
- [x] **SURFACE-03**: Orphaned workflow files reconciled — diagnose-issues, discovery-phase, node-repair, transition, verify-phase either wired to commands/gsd/ or removed with changelog note

### TEST — Scenario & Contract Tests

- [x] **TEST-01**: End-to-end behavioral test: ambiguous input → clarification fired → blocked state written to STATE.md → resume detects blocked → user resolves → continuation only after valid resolution
- [x] **TEST-02**: Gate behavior tests: plan-phase and execute-phase reject invocation when `clarification_status: blocked`
- [x] **TEST-03**: Checkpoint artifact lifecycle test: CHECKPOINT.md written on block, validated on resume, cleared on resolve
- [x] **TEST-04**: Execution artifact contract test: SUMMARY.md validated against `executionSummarySchema` post-execution
- [x] **TEST-05**: 5 currently untracked test files committed to git (checkpoint-contract, checkpoint-validator, state-clarification, verify-context-contract, verify-research-contract) — invisible to CI on clean checkout

### SCHEMA — Artifact Schema Hardening

- [x] **SCHEMA-01**: `checkpointArtifactSchema` (Zod) — canonical shape for persisted CHECKPOINT.md (status, type, why_blocked, what_is_uncertain, choices, allow_freeform, resume_condition, resolved_at)
- [x] **SCHEMA-02**: `executionSummarySchema` (Zod) — canonical shape for SUMMARY.md (one_liner, work_completed, key_files, verification, requirements_completed)
- [x] **SCHEMA-03**: `cmdVerifySummary` upgraded to validate against `executionSummarySchema` (currently only checks file count)
- [x] **SCHEMA-04**: `checkpointResponseSchema` (Zod) formalizes the agent checkpoint return contract — replaces manual field-by-field checking in `cmdVerifyCheckpointResponse` (verify.cjs line 211)
- [x] **SCHEMA-05**: `interpretationResultSchema` / `baseSeedSchema` decomposed into composable sub-schemas — the current fat combined blob (interpretation + ambiguity + lockability + audit + route + clarification) is one opaque contract that's hard to extend and test in isolation

## v3 Requirements (Deferred)

- Hard state machine conductor runtime with explicit finite state transitions (beyond workflow-and-validator architecture)
- Escalation ladder for repeated clarifications (round 1-2 re-ask, round 3+ force decision or defer)
- Auto-retry with escalating model size on checkpoint failure
- Isolated test runner for full workflow simulation without live Claude calls

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rewrite planner/executor logic | Constraint from v0.1.0: enhance don't replace |
| New ITL providers | v0.1.0 shipped Claude/Gemini/Kimi/OpenAI adapters — sufficient for now |
| UI / web interface | CLI-first; web is a separate product surface |
| Multi-user / team collaboration | Single-user tool scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 15 | Complete |
| SCHEMA-04 | Phase 15 | Complete |
| SCHEMA-05 | Phase 15 | Complete |
| CHECKPOINT-04 | Phase 15 | Complete |
| CHECKPOINT-01 | Phase 16 | Complete |
| CHECKPOINT-02 | Phase 16 | Complete |
| CHECKPOINT-03 | Phase 16 | Complete |
| ENFORCE-01 | Phase 17 | Complete |
| ENFORCE-02 | Phase 17 | Complete |
| ENFORCE-03 | Phase 17 | Complete |
| ENFORCE-04 | Phase 17 | Complete |
| ENFORCE-05 | Phase 17 | Complete |
| CONTEXT-01 | Phase 18 | Complete |
| CONTEXT-02 | Phase 18 | Complete |
| CONTEXT-03 | Phase 18 | Complete |
| CONTEXT-04 | Phase 18 | Complete |
| SURFACE-01 | Phase 19 | Complete |
| SURFACE-02 | Phase 19 | Complete |
| SURFACE-03 | Phase 19 | Complete |
| SCHEMA-02 | Phase 19 | Complete |
| SCHEMA-03 | Phase 19 | Complete |
| TEST-01 | Phase 20 | Complete |
| TEST-02 | Phase 20 | Complete |
| TEST-03 | Phase 20 | Complete |
| TEST-04 | Phase 20 | Complete |
| TEST-05 | Phase 20 | Complete |

**Coverage:**
- v0.2 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-18 — All requirements complete and verified*

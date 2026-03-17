# Requirements: get-stuff-done

**Defined:** 2026-03-17
**Core Value:** Runtime-bound orchestration integrity — enforcement that cannot be bypassed by following a different workflow path

## v0.2 Requirements

### ENFORCE — Runtime Gate Enforcement

- [ ] **ENFORCE-01**: Orchestrator refuses to proceed when `clarification_status: blocked` in STATE.md (applies to plan-phase, execute-phase, autonomous)
- [ ] **ENFORCE-02**: `verify checkpoint-response` is a mandatory hard gate in execute-phase — wave cannot advance unless it passes
- [ ] **ENFORCE-03**: `resume-project` routes to unblock flow when `clarification_status: blocked` rather than silently routing to execute/plan
- [ ] **ENFORCE-04**: `autonomous` checks clarification_status per-phase and halts with explanation when blocked

### CHECKPOINT — Persistent Checkpoint Artifact

- [ ] **CHECKPOINT-01**: Canonical CHECKPOINT.md written to phase directory on every blocking checkpoint
- [ ] **CHECKPOINT-02**: CHECKPOINT.md re-read and validated by resume-project before routing continuation
- [ ] **CHECKPOINT-03**: Checkpoint lifecycle tracked in STATE.md (pending / awaiting-response / resolved)
- [ ] **CHECKPOINT-04**: `checkpointArtifactSchema` (Zod) defines the canonical shape of CHECKPOINT.md

### CONTEXT — Pre-flight Context Enrichment

- [ ] **CONTEXT-01**: Before escalating clarification to user, system harvests STATE.md decisions, CONTEXT.md canonical_refs, and PLAN.md for auto-resolution candidates
- [ ] **CONTEXT-02**: Clarification prompts include what was found in ambient state (pre-answered or narrowed questions)
- [ ] **CONTEXT-03**: `discuss-seed` receives relevant ambient context fields alongside the narrative input

### SURFACE — Workflow Surface Hardening

- [ ] **SURFACE-01**: `research-phase` and `validate-phase` get blocked-state gate check at entry
- [ ] **SURFACE-02**: `autonomous` gets per-phase blocked-state awareness and halts with a clear explanation and resume path
- [ ] **SURFACE-03**: Orphaned workflow files reconciled — diagnose-issues, discovery-phase, node-repair, transition, verify-phase either wired to commands/gsd/ or removed with changelog note

### TEST — Scenario & Contract Tests

- [ ] **TEST-01**: End-to-end behavioral test: ambiguous input → clarification fired → blocked state written to STATE.md → resume detects blocked → user resolves → continuation only after valid resolution
- [ ] **TEST-02**: Gate behavior tests: plan-phase and execute-phase reject invocation when `clarification_status: blocked`
- [ ] **TEST-03**: Checkpoint artifact lifecycle test: CHECKPOINT.md written on block, validated on resume, cleared on resolve
- [ ] **TEST-04**: Execution artifact contract test: SUMMARY.md validated against `executionSummarySchema` post-execution

### SCHEMA — Artifact Schema Hardening

- [ ] **SCHEMA-01**: `checkpointArtifactSchema` (Zod) — canonical shape for persisted CHECKPOINT.md (status, type, why_blocked, what_is_uncertain, choices, allow_freeform, resume_condition, resolved_at)
- [ ] **SCHEMA-02**: `executionSummarySchema` (Zod) — canonical shape for SUMMARY.md (one_liner, work_completed, key_files, verification, requirements_completed)
- [ ] **SCHEMA-03**: `cmdVerifySummary` upgraded to validate against `executionSummarySchema` (currently only checks file count)
- [ ] **SCHEMA-04**: `checkpointResponseSchema` (Zod) formalizes the agent checkpoint return contract — replaces manual field-by-field checking in `cmdVerifyCheckpointResponse` (verify.cjs line 211)
- [ ] **SCHEMA-05**: `interpretationResultSchema` / `baseSeedSchema` decomposed into composable sub-schemas — the current fat combined blob (interpretation + ambiguity + lockability + audit + route + clarification) is one opaque contract that's hard to extend and test in isolation

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
| SCHEMA-01 | Phase 15 | Pending |
| SCHEMA-04 | Phase 15 | Pending |
| SCHEMA-05 | Phase 15 | Pending |
| CHECKPOINT-04 | Phase 15 | Pending |
| CHECKPOINT-01 | Phase 16 | Pending |
| CHECKPOINT-02 | Phase 16 | Pending |
| CHECKPOINT-03 | Phase 16 | Pending |
| ENFORCE-01 | Phase 17 | Pending |
| ENFORCE-02 | Phase 17 | Pending |
| ENFORCE-03 | Phase 17 | Pending |
| ENFORCE-04 | Phase 17 | Pending |
| CONTEXT-01 | Phase 18 | Pending |
| CONTEXT-02 | Phase 18 | Pending |
| CONTEXT-03 | Phase 18 | Pending |
| SURFACE-01 | Phase 19 | Pending |
| SURFACE-02 | Phase 19 | Pending |
| SURFACE-03 | Phase 19 | Pending |
| SCHEMA-02 | Phase 19 | Pending |
| SCHEMA-03 | Phase 19 | Pending |
| TEST-01 | Phase 20 | Pending |
| TEST-02 | Phase 20 | Pending |
| TEST-03 | Phase 20 | Pending |
| TEST-04 | Phase 20 | Pending |

**Coverage:**
- v0.2 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 — Traceability complete after roadmap creation*

# Roadmap

## Milestones

- [x] **v0.1.0 Intent Translation Layer** - Phases 1-14 (shipped 2026-03-17)
- [x] **v0.2.0 Orchestration Integrity** - Phases 15-21 (shipped 2026-03-18)

## Archived Milestones

<details>
<summary>v0.1.0 Intent Translation Layer (Phases 1-14) — SHIPPED 2026-03-17</summary>

Delivered: narrative-first intake, deterministic ITL runtime, Zod schema layer, Claude/Gemini/Kimi/OpenAI adapters, standalone packages/itl module, 100% line-coverage gate.

See full archived roadmap: `.planning/milestones/v0.1.0-ROADMAP.md`

</details>

---

## v0.2.0 Orchestration Integrity

**Milestone Goal:** Harden the enforcement model from workflow-described to runtime-bound — persistent checkpoint artifact, mandatory gate checks, pre-flight context enrichment, schema contracts for execution artifacts, and full end-to-end scenario tests.

### Phases

- [x] **Phase 15: Schema Foundation** - Zod schemas for checkpoint response, checkpoint artifact, and ITL sub-schema decomposition (completed 2026-03-17)
- [x] **Phase 16: Checkpoint Artifact Lifecycle** - CHECKPOINT.md written, re-read, validated, and tracked across resume boundaries (completed 2026-03-17)
- [x] **Phase 17: Runtime Gate Enforcement** - Blocked-state gates in plan-phase, execute-phase, autonomous, and resume-project (completed 2026-03-17)
- [x] **Phase 18: Context Enrichment** - Pre-flight ambient state harvest before clarification escalation (completed 2026-03-17)
- [x] **Phase 19: Workflow Surface Hardening** - research-phase, validate-phase, autonomous blocked-state gates; SUMMARY.md schema contract; orphaned workflow reconciliation (completed 2026-03-17)
- [x] **Phase 20: Scenario and Contract Tests** - Full behavioral loop tests and artifact contract validation (completed 2026-03-17)
- [x] **Phase 21: Brownfield Resilience** - Mega Audit stress-test against un-sanitized legacy chaos (completed 2026-03-18)

### Phase Details

#### Phase 15: Schema Foundation
**Goal**: Canonical Zod schemas exist for all v0.2.0 execution artifacts and the ITL contract is decomposed into composable sub-schemas
**Depends on**: v0.1.0 (complete)
**Requirements**: SCHEMA-01, SCHEMA-04, SCHEMA-05, CHECKPOINT-04
**Success Criteria**:
  1. `checkpointArtifactSchema` is importable and validates CHECKPOINT.md
  2. `checkpointResponseSchema` replaces manual field checking in `cmdVerifyCheckpointResponse`
  3. `interpretationResultSchema` / `baseSeedSchema` are decomposed into sub-schemas
  4. All new schemas have passing unit tests
**Plans**:
- [x] 15-01-PLAN.md — Create artifact-schema.cjs with schemas
- [x] 15-02-PLAN.md — Add individual named exports to itl-schema.cjs
- [x] 15-03-PLAN.md — Wire checkpointResponseSchema into verify.cjs
- [x] 15-04-PLAN.md — Fix Zod v3-to-v4 API bugs (gap closure)

#### Phase 16: Checkpoint Artifact Lifecycle
**Goal**: CHECKPOINT.md is written on every blocking checkpoint, re-read and validated by resume-project, and its lifecycle state is tracked in STATE.md
**Depends on**: Phase 15
**Requirements**: CHECKPOINT-01, CHECKPOINT-02, CHECKPOINT-03
**Success Criteria**:
  1. CHECKPOINT.md exists on block with all required fields
  2. resume-project validates CHECKPOINT.md on resume
  3. STATE.md reflects checkpoint lifecycle state correctly
**Plans**:
- [x] 16-01-PLAN.md — Add state checkpoint CLI and frontmatter fields
- [x] 16-02-PLAN.md — Create tests/checkpoint-lifecycle.test.cjs scaffold
- [x] 16-03-PLAN.md — Add CHECKPOINT.md write step to workflows
- [x] 16-04-PLAN.md — Add checkpoint validation and routing to resume-project

#### Phase 17: Runtime Gate Enforcement
**Goal**: Any workflow invocation against a project in `clarification_status: blocked` is rejected at runtime
**Depends on**: Phase 16
**Requirements**: ENFORCE-01, ENFORCE-02, ENFORCE-03, ENFORCE-04, ENFORCE-05
**Success Criteria**:
  1. Invoking plan/execute when blocked produces a hard rejection
  2. Autonomous halts with explanation when blocked
  3. `verify checkpoint-response` is a mandatory gate in execute-phase
  4. resume-project routes to unblock flow when blocked
  5. `verify research-contract` is a mandatory gate in plan-phase
**Plans**:
- [x] 17-01-PLAN.md — Add clarification_status to init; implement workflow entry gates
- [x] 17-02-PLAN.md — Hard validation gates and status-aware resume routing

#### Phase 18: Context Enrichment
**Goal**: Before escalating clarification, the system harvests ambient project state to auto-resolve or narrow questions
**Depends on**: Phase 17
**Requirements**: CONTEXT-01, CONTEXT-02, CONTEXT-03, CONTEXT-04
**Success Criteria**:
  1. System harvests STATE/CONTEXT/PLAN before user is prompted
  2. Clarification prompts include summary of ambient state
  3. `discuss-seed` receives relevant ambient context fields
  4. ITL output is persisted to `{phase_dir}/{phase}-ITL.json`
**Plans**:
- [x] 18-01-PLAN.md — Ambient context harvesting and ITL persistence logic
- [x] 18-02-PLAN.md — Workflow integration for discuss-phase and plan-phase

#### Phase 19: Workflow Surface Hardening
**Goal**: All remaining workflow surfaces get gate checks; SUMMARY.md has a validated schema contract; orphaned workflows resolved
**Depends on**: Phase 18
**Requirements**: SURFACE-01, SURFACE-02, SURFACE-03, SCHEMA-02, SCHEMA-03
**Success Criteria**:
  1. research-phase and validate-phase get blocked-state gates
  2. autonomous halts with explanation per phase
  3. cmdVerifySummary validates against executionSummarySchema
  4. Orphaned workflows moved to lib/ or removed
**Plans**:
- [x] 19-01-PLAN.md — Gates, lib extraction, and SUMMARY.md schema enforcement

#### Phase 20: Scenario and Contract Tests
**Goal**: Full pause-clarify-blocked-resume-resolve behavioral loop covered by end-to-end tests
**Depends on**: Phase 19
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria**:
  1. Test exercises complete clarification loop
  2. Gate behavior tests confirm rejection when blocked
  3. Checkpoint lifecycle test covers all transitions
  4. Contract test validates SUMMARY.md against schema
  5. Untracked test files committed and passing
**Plans**:
- [x] 20-01-PLAN.md — End-to-end behavioral tests, gate enforcement tests, summary schema expansion, and regression test cleanup

#### Phase 21: Brownfield Resilience
**Goal**: Zero-sanitization stress test of v0.2.0 orchestration rules against legacy chaos
**Depends on**: Phase 20
**Requirements**: Mega Audit Vector 1, 2, 3, 4
**Success Criteria**:
  1. Legacy Phase 1-14 summaries pass verification with "Legacy Compliance" status
  2. State repair logic auto-recovers from orphaned blocked states
  3. Pre-flight harvesting supports 2,000+ line STATE.md files
  4. Orphaned workflows in lib/ maintain backward compatibility
**Plans**:
- [x] 21-01-PLAN.md — Schema Resilience & Legacy Fixtures (Vector 1)
- [x] 21-02-PLAN.md — Deadlock Detection & State Repair (Vector 2)
- [x] 21-03-PLAN.md — Large-Scale Context Harvesting & Truncation (Vector 3)
- [x] 21-04-PLAN.md — Workflow Library Backward Compatibility (Vector 4)

---

## Progress

**Execution Order:** 15 → 16 → 17 → 18 → 19 → 20 → 21

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 15. Schema Foundation | 4/4 | Complete    | 2026-03-17 | - |
| 16. Checkpoint Artifact Lifecycle | 4/4 | Complete    | 2026-03-17 | - |
| 17. Runtime Gate Enforcement | 2/2 | Complete    | 2026-03-17 | - |
| 18. Context Enrichment | 2/2 | Complete    | 2026-03-17 | - |
| 19. Workflow Surface Hardening | 1/1 | Complete    | 2026-03-17 | - |
| 20. Scenario and Contract Tests | 1/1 | Complete    | 2026-03-17 | - |
| 21. Brownfield Resilience | 4/4 | Complete    | 2026-03-18 | - |

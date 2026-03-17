# Roadmap

## Milestones

- [x] **v0.1.0 Intent Translation Layer** - Phases 1-14 (shipped 2026-03-17)
- [ ] **v0.2.0 Orchestration Integrity** - Phases 15-20 (in progress)

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
- [ ] **Phase 16: Checkpoint Artifact Lifecycle** - CHECKPOINT.md written, re-read, validated, and tracked across resume boundaries
- [ ] **Phase 17: Runtime Gate Enforcement** - Blocked-state gates in plan-phase, execute-phase, autonomous, and resume-project
- [ ] **Phase 18: Context Enrichment** - Pre-flight ambient state harvest before clarification escalation
- [ ] **Phase 19: Workflow Surface Hardening** - research-phase, validate-phase, autonomous blocked-state gates; SUMMARY.md schema contract; orphaned workflow reconciliation
- [ ] **Phase 20: Scenario and Contract Tests** - Full behavioral loop tests and artifact contract validation

### Phase Details

#### Phase 15: Schema Foundation
**Goal**: Canonical Zod schemas exist for all v0.2.0 execution artifacts and the ITL contract is decomposed into composable sub-schemas
**Depends on**: v0.1.0 (complete)
**Requirements**: SCHEMA-01, SCHEMA-04, SCHEMA-05, CHECKPOINT-04
**Success Criteria** (what must be TRUE):
  1. `checkpointArtifactSchema` is importable from the schema layer and validates a well-formed CHECKPOINT.md payload without error
  2. `checkpointResponseSchema` replaces manual field-by-field checking in `cmdVerifyCheckpointResponse` — a missing required field causes schema validation to throw, not silently pass
  3. `interpretationResultSchema` / `baseSeedSchema` are decomposed into independently testable sub-schemas — each sub-schema can be imported and tested in isolation without pulling the full combined blob
  4. All new schemas have passing unit tests that cover valid shape, missing required fields, and invalid field types
**Plans**: 4 plans

Plans:
- [ ] 15-01-PLAN.md — Create artifact-schema.cjs with checkpointArtifactSchema, checkpointResponseSchema, executionSummarySchema
- [ ] 15-02-PLAN.md — Add individual named exports to itl-schema.cjs (SCHEMA-05 additive decomposition)
- [ ] 15-03-PLAN.md — Wire checkpointResponseSchema into verify.cjs and add unit tests for all new schemas
- [ ] 15-04-PLAN.md — Fix Zod v3-to-v4 API bugs in verify.cjs and checkpoint-validator.test.cjs (gap closure)

#### Phase 16: Checkpoint Artifact Lifecycle
**Goal**: CHECKPOINT.md is written on every blocking checkpoint, re-read and validated by resume-project, and its lifecycle state is tracked in STATE.md
**Depends on**: Phase 15
**Requirements**: CHECKPOINT-01, CHECKPOINT-02, CHECKPOINT-03
**Success Criteria** (what must be TRUE):
  1. When a blocking checkpoint fires, a CHECKPOINT.md file exists in the phase directory containing all required fields (status, type, why_blocked, what_is_uncertain, choices, allow_freeform, resume_condition)
  2. When resume-project runs, it reads CHECKPOINT.md and validates it against `checkpointArtifactSchema` before routing — an invalid or missing artifact causes resume to surface an error rather than silently routing to execute/plan
  3. STATE.md reflects the checkpoint lifecycle state (`pending` / `awaiting-response` / `resolved`) and that state transitions correctly as the checkpoint progresses
**Plans**: TBD

#### Phase 17: Runtime Gate Enforcement
**Goal**: Any workflow invocation against a project in `clarification_status: blocked` is rejected at runtime — not just documented as a workflow step
**Depends on**: Phase 16
**Requirements**: ENFORCE-01, ENFORCE-02, ENFORCE-03, ENFORCE-04, ENFORCE-05
**Success Criteria** (what must be TRUE):
  1. Invoking plan-phase or execute-phase when STATE.md has `clarification_status: blocked` produces a hard rejection with a clear message identifying the blocked state — execution does not proceed
  2. Invoking autonomous when a phase is blocked causes autonomous to halt with an explanation and a resume path — it does not silently skip the blocked phase and continue
  3. `verify checkpoint-response` is a mandatory gate in execute-phase — a wave does not advance if the checkpoint response validation fails
  4. Invoking resume-project when `clarification_status: blocked` routes to the unblock flow rather than to execute/plan — the user is told what is blocking and how to resolve it
  5. `verify research-contract` is called in plan-phase inline research path after researcher returns — not only in standalone research-phase
**Plans**: TBD

#### Phase 18: Context Enrichment
**Goal**: Before escalating any clarification to the user, the system harvests ambient project state and either auto-resolves or narrows the question using that context
**Depends on**: Phase 17
**Requirements**: CONTEXT-01, CONTEXT-02, CONTEXT-03, CONTEXT-04
**Success Criteria** (what must be TRUE):
  1. When a clarification is about to be escalated, the system has already checked STATE.md decisions, CONTEXT.md canonical_refs, and PLAN.md for candidates that answer or narrow the question — this harvest happens before the user is prompted
  2. Clarification prompts shown to the user include a summary of what was found in ambient state (pre-answered fields are marked; narrowed choices reflect found context)
  3. `discuss-seed` receives relevant ambient context fields alongside the narrative input — the seed is enriched, not bare
  4. ITL output (ambiguity score, lockability determination, clarification.mode) is persisted to `{phase_dir}/{phase}-ITL.json` after discuss-phase — plan-phase in a new context window reads this file instead of starting blind
**Plans**: TBD

#### Phase 19: Workflow Surface Hardening
**Goal**: All remaining workflow surfaces with blocked-state exposure get gate checks; SUMMARY.md has a validated schema contract; orphaned workflow files are resolved
**Depends on**: Phase 18
**Requirements**: SURFACE-01, SURFACE-02, SURFACE-03, SCHEMA-02, SCHEMA-03
**Success Criteria** (what must be TRUE):
  1. Invoking research-phase or validate-phase when `clarification_status: blocked` produces a blocked-state rejection at entry — neither workflow proceeds past the gate
  2. `autonomous` halts with a clear explanation and resume path when it encounters a per-phase blocked state — the user is told which phase is blocked and what step resolves it
  3. `executionSummarySchema` exists and `cmdVerifySummary` validates SUMMARY.md against it — a SUMMARY.md missing required fields or containing invalid types fails verification rather than passing silently
  4. Orphaned workflow files (diagnose-issues, discovery-phase, node-repair, transition, verify-phase) are either wired to commands/gsd/ or removed with a changelog entry — no dangling unreachable workflow files remain
**Plans**: TBD

#### Phase 20: Scenario and Contract Tests
**Goal**: The full pause-clarify-blocked-resume-resolve behavioral loop is covered by end-to-end scenario tests, and all execution artifact schemas have contract test coverage
**Depends on**: Phase 19
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. A test exercises the complete loop: ambiguous input fires clarification, blocked state is written to STATE.md, resume detects blocked, user provides resolution, continuation only proceeds after valid resolution — all assertions pass
  2. Gate behavior tests confirm plan-phase and execute-phase reject invocation when `clarification_status: blocked` — tests fail if either workflow proceeds past the gate
  3. A checkpoint artifact lifecycle test confirms CHECKPOINT.md is written on block, validated on resume, and cleared on resolve — the test covers all three lifecycle transitions
  4. A contract test validates a real SUMMARY.md output against `executionSummarySchema` post-execution — the test fails if SUMMARY.md does not conform to the schema
  5. The 5 previously untracked test files (checkpoint-contract, checkpoint-validator, state-clarification, verify-context-contract, verify-research-contract) are committed to git and passing in CI on a clean checkout
**Plans**: TBD

---

## Progress

**Execution Order:** 15 → 16 → 17 → 18 → 19 → 20

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 15. Schema Foundation | 4/4 | Complete   | 2026-03-17 | - |
| 16. Checkpoint Artifact Lifecycle | v0.2.0 | 0/TBD | Not started | - |
| 17. Runtime Gate Enforcement | v0.2.0 | 0/TBD | Not started | - |
| 18. Context Enrichment | v0.2.0 | 0/TBD | Not started | - |
| 19. Workflow Surface Hardening | v0.2.0 | 0/TBD | Not started | - |
| 20. Scenario and Contract Tests | v0.2.0 | 0/TBD | Not started | - |

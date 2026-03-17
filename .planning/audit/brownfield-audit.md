# Brownfield Audit — get-stuff-done v0.2.0

**Date:** 2026-03-17
**Scope:** Full codebase audit for milestone planning

---

## 1. Architecture & Enforcement Gaps

### State Machine: No Runtime Gates

`clarification_status` is stored in STATE.md and exposed in `state-snapshot` JSON, but **no orchestrator checks it before proceeding**. The field is write-only from a gate perspective.

- `plan-phase.md` — no check of `clarification_status` before starting (line ~350 reads STATE_PATH but only for context, not gating)
- `execute-phase.md` — no check of blocked state before wave execution
- `autonomous.md` — runs all phases without checking per-phase or per-loop clarification state
- `resume-project.md` — lines 262-264 mention clarification fields in a template block, but routing logic (lines 144-173) does not gate on `blocked`
- `new-milestone.md` — no gate check at entry
- `research-phase.md` — no gate check

**Result:** A session can be `Clarification Status: blocked` and any workflow can still run unimpeded.

### Checkpoint Enforcement: Optional, Not Mandatory

`verify checkpoint-response` exists as a CLI command (`gsd-tools.cjs` line 379) and is mentioned in `execute-phase.md` and `execute-plan.md`, but:
- It is never called with `|| exit 1` semantics
- There is no wrapper that prevents wave advancement if it isn't called
- Agents can return `status: checkpoint` without it being validated before the orchestrator presents it to the user

### No Persistent Checkpoint Artifact

Checkpoint payloads are validated in-flight via `cmdVerifyCheckpointResponse` (verify.cjs line 211) but nothing is written to disk. On resume, there is no canonical file to prove what checkpoint was shown, what the user responded, or whether validation passed.

### Context Propagation: Reactive, Not Pre-flight

When a clarification checkpoint fires (discuss-phase.md lines 318-327, quick.md lines 162-185):
- The ITL `discuss-seed` call takes the narrative only
- No pre-flight check of STATE.md decisions, CONTEXT.md canonical_refs, git log, or PLAN.md for auto-resolution
- Ambient project state is available but not consulted before escalating to user

---

## 2. Workflow Surface Completeness

### Tier 1 — Full Checkpoint Discipline (7 surfaces)
discuss-phase, execute-phase, execute-plan, new-project, quick, verify-work, resume-project

### Tier 2 — Partial (2 surfaces)
- `plan-phase` — no clarification_status gate check at entry
- `new-milestone` — no gate check, no blocked-state handling

### Tier 3 — No Enforcement (30+ surfaces)
All admin/utility workflows: add-phase, add-tests, add-todo, audit-milestone, autonomous, check-todos, cleanup, complete-milestone, diagnose-issues, do, health, insert-phase, list-phase-assumptions, map-codebase, note, pause-work, plan-milestone-gaps, profile-user, remove-phase, research-phase, settings, stats, transition, ui-phase, ui-review, update, validate-phase, verify-phase

**Note:** Most Tier 3 surfaces are intentionally simple (admin/utility). The critical gap is `autonomous` and `research-phase` — these run execution-critical operations without any blocked-state awareness.

### Command/Workflow Alignment
**In workflows/ but NOT in commands/gsd/:** diagnose-issues, discovery-phase, execute-plan (internal subworkflow — OK), node-repair, transition (deprecated?), verify-phase
**In commands/gsd/ but NOT in workflows/:** debug (has skill), join-discord, reapply-patches, resume-work, set-profile

---

## 3. Test Coverage Gaps

### Untested Lib Files
- `model-profiles.cjs` — no test file
- `profile-output.cjs` — no test file
- `profile-pipeline.cjs` — no test file
- `template.cjs` — no test file
- `itl-adapters.cjs` — tested via integration in itl.test.cjs but no isolated adapter tests

### Missing Behavioral/Scenario Tests
1. **Pause→clarify→blocked→resume→resolve** full loop — no test proves this end-to-end
2. **Blocked state gates** — no test proves `plan-phase` or `execute-phase` refuse when `clarification_status: blocked`
3. **Autonomous stops on blocked** — no test proves autonomous halts at a blocking clarification
4. **Checkpoint artifact written and re-read** — no test because the artifact doesn't exist yet
5. **SUMMARY.md contract** — no test validates execution summary against a schema

### Validator Test Gaps
- `cmdVerifySummary` (verify.cjs line 12) tested in verify.test.cjs line 385+, but only checks file count logic, not content contract
- `cmdVerifyPhaseCompleteness` (verify.cjs line 265) tested but doesn't validate checkpoint artifact presence
- No test for `cmdVerifyCheckpointResponse` being called as a mandatory gate (only tests its validation logic)

---

## 4. Artifact Lifecycle Gaps

| Artifact | Written | Validated | Re-read on Resume | Schema |
|----------|---------|-----------|-------------------|--------|
| CONTEXT.md | ✓ discuss-phase | ✓ verify context-contract | ✗ not enforced | ✗ none |
| RESEARCH.md | ✓ research agents | ✓ verify research-contract | ✗ not enforced | ✗ none |
| PLAN.md | ✓ planner | ✓ verify plan-structure | ✓ executor reads | ✗ none |
| SUMMARY.md | ✓ executor | ✗ only file count | ✗ not re-read | ✗ none |
| CHECKPOINT.md | ✗ **doesn't exist** | ✗ | ✗ | ✗ |
| STATE.md | ✓ all workflows | ✗ partial | ✓ resume reads | ✗ none |

**Biggest gap:** CHECKPOINT.md doesn't exist. SUMMARY.md is unvalidated.

---

## 5. Schema/Contract Drift

- `interpretationSchema` (itl-schema.cjs line 64) — canonical, well-defined, Zod-validated
- `ambiguitySchema` (line 86) — canonical, well-defined
- `lockabilitySchema` (line 101) — canonical, well-defined
- **Missing:** `checkpointArtifactSchema` — no Zod schema for what a persisted checkpoint looks like
- **Missing:** `executionSummarySchema` — no Zod schema for SUMMARY.md content
- `clarificationSchema` in STATE.md — fields exist (status, rounds, reason, resume_requires_user_input) but no Zod validation on read

---

## 6. ITL Integration Gaps

The ITL (interpret_narrative, discuss-seed, clarification modes) is well-integrated into:
- discuss-phase (clarification loop)
- quick (clarification checkpoint)
- new-project (narrative seed)

It is **not integrated** into:
- Pre-flight context enrichment before any clarification escalation (should check ambient state first)
- Execution-phase continuation decisions (executor doesn't use ITL to assess whether a SUMMARY indicates unresolved ambiguity)
- Resume routing (resume-project doesn't use ITL to assess if resumed state has clarification gaps)

---

## 7. Risk Ranking

| Gap | Risk | Impact |
|-----|------|--------|
| No runtime gate on blocked clarification | High | Silent bypass of blocking stops |
| No persistent checkpoint artifact | High | Cannot audit or prove resume integrity |
| Context enrichment pre-flight missing | Medium | Unnecessary user interruptions |
| SUMMARY.md unvalidated | Medium | Execution artifacts can drift silently |
| autonomous has no blocked-state awareness | High | Full milestone can execute past a block |
| Missing scenario tests | Medium | Enforcement regressions go undetected |
| Orphaned workflow files | Low | Dead surface confusion |

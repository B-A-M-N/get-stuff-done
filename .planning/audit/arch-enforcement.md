# Architecture & Enforcement Audit

**Source:** gsd-codebase-mapper agent output

## Current Architecture

Two-layer hybrid: hard-code layer (state.cjs, verify.cjs, itl.cjs) correctly implements primitives, but every call into those primitives is voluntary. The prose-instruction layer (workflows/*.md) describes when to call them. LLM agent compliance is the only enforcement mechanism.

## Enforcement Gaps

- `gsd-tools.cjs` has no pre-condition checking at the CLI router level — any workflow command can be invoked in any project state
- `verify phase-completeness` is never called before `verify_phase_goal` in `execute-phase` — allows false "Phase Complete" signals when plans have no SUMMARY
- `verify checkpoint-response` is workflow-described, not mandatory — agent can skip it and present malformed checkpoints to user
- `verify research-contract` is never called in `plan-phase` critical path after researcher returns — only called in standalone `/gsd:research-phase`
- Auto-mode checkpoint bypass (`_auto_chain_active`) has no scope restriction — any agent can set it; does NOT exclude `checkpoint:human-action` type in code

## State Machine Gaps

- No transition guards: plan-phase can run mid-execution, execute-phase can run with no plans, discuss-phase can run while clarification is already `blocked`
- `cmdStateAdvancePlan` (state.cjs lines 210-237) transitions to "Phase complete" based on a counter field, not a live disk check for SUMMARY files
- Paused state is heuristic — `buildStateFrontmatter` (line 684) matches "paused"/"stopped" strings. No `cmdStatePause` function exists
- `cmdStateAddDecision` has no deduplication — re-runs accumulate duplicate entries in STATE.md

## Context Propagation Gaps

- **ITL output is not persisted.** The `ambiguity` score, `findings`, and `clarification.mode = blocking` determination exist only for the lifespan of the discuss-phase session. Plan-phase in a new window never sees them
- "Unresolved Ambiguities" is a warning, not an error when missing from CONTEXT.md (`verify.cjs` line 550)
- The PRD express path in `plan-phase.md` generates CONTEXT.md without a `research_cues` block
- `verify research-contract` exists and is correct but is never called in the plan-phase critical path

## Structural Recommendations

1. Add `state assert` pre-condition command and wire into each workflow's init step
2. Persist ITL output to `{phase_dir}/{padded_phase}-ITL.json` for cross-session availability
3. Make `verify phase-completeness` mandatory before `verify_phase_goal` in execute-phase
4. Surface `Resume Requires User Input` as a blocking advisory in plan-phase and execute-phase init
5. Add deduplication to `cmdStateAddDecision`
6. Add `verify research-contract` call to plan-phase after researcher return
7. Introduce explicit `cmdStatePause` / `cmdStateResume` pair to replace heuristic string matching
8. Extend `validate health` to detect stranded clarification checkpoints

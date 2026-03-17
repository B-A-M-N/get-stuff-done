# Phase 8 Research: ITL-to-Planning Integration

## Objective
Research how to feed ITL-derived context cleanly into the planning workflow so `plan-phase` and the planner agent benefit from narrative-first inputs, assumptions, and research cues without breaking existing plan structures, verification loops, or governance boundaries.

Additional steering:
- The installed user-facing command surface is `/dostuff:*`.
- The canonical source files still live under `commands/gsd/` and `get-stuff-done/workflows/`.
- Phase 8 should build on the context and research handoff work from Phase 7 rather than inventing a separate planning artifact model.

## Standard Stack
- **Keep orchestration in the existing source planning command/workflow pair**
  - `commands/gsd/plan-phase.md`
  - `get-stuff-done/workflows/plan-phase.md`
- **Keep upstream context inputs as files**
  - `CONTEXT.md`
  - `RESEARCH.md`
  - `REQUIREMENTS.md`
  - `STATE.md`
- **Keep implementation logic in existing CommonJS modules when needed**
  - `get-stuff-done/bin/gsd-tools.cjs`
  - `get-stuff-done/bin/lib/itl.cjs`
  - existing `init plan-phase` and roadmap/state helpers
- **Keep output contracts unchanged**
  - `PLAN.md` remains the planner artifact
  - `VALIDATION.md` / checker loop remain unchanged
- **Testing stack**
  - `node:test`
  - focused assertions in `tests/*.test.cjs`

## Architecture Patterns

### 1. Treat ITL-derived planning cues as planner context, not plan output
The best integration point is in the planner handoff and workflow guidance, not in a new artifact type.

Recommended rule:
- ITL-derived assumptions, narrative summaries, and research emphasis should shape the planner prompt.
- PLAN.md remains the artifact the planner writes.
- Validation should continue to judge plans against normal structure and requirements.

### 2. Modify the source planning workflow, not installed-only surfaces
The repo’s source-of-truth should stay in:
- `commands/gsd/plan-phase.md`
- `get-stuff-done/workflows/plan-phase.md`

Installed `/dostuff:*` projections should remain Phase 3’s responsibility.

### 3. Preserve the distinction between locked decisions and inferred guidance
Planning is where silent drift would become dangerous.

Recommended rule:
- `Implementation Decisions` from CONTEXT.md and explicit requirements remain authoritative.
- `Research Cues`, narrative summaries, and interpreted assumptions inform task shaping and sequencing.
- Inferred cues must never be promoted to hard requirements unless the user explicitly confirmed them upstream.

### 4. Keep the planner prompt compact and prescriptive
The planner already consumes a lot of context.

Recommended behavior:
- Add explicit instructions about how to interpret enriched CONTEXT sections.
- Prefer concise prompt rules over pasting large extra payloads.
- Tell the planner how to weight decisions, assumptions, risks, and unknowns when producing plans.

### 5. Preserve the checker and Nyquist loops exactly
Phase 8 must not weaken the verification path for plans.

Recommended rule:
- Existing plan structure, validation loops, and checker iterations remain untouched.
- The new work should improve plan quality, not change the acceptance contract.

### 6. Keep PRD express path compatible
`plan-phase --prd` can bypass discuss-phase.

Recommended behavior:
- Any planning guidance added in Phase 8 should still work when CONTEXT.md came from a PRD rather than narrative-first discussion.
- The planner prompt should gracefully use whatever context sections exist without requiring all narrative-first fields.

### 7. Avoid duplicating context across planning files
The planner should consume enriched context, not rewrite all of it into plan prose.

Recommended rule:
- Plans should remain concrete, actionable tasks.
- The richer intent framing should influence task shape, sequencing, and verification criteria, not create bloated plan files.

## Don’t Hand-Roll
- Do not create a parallel planning artifact outside PLAN.md.
- Do not promote inferred assumptions to required acceptance criteria automatically.
- Do not bypass the planner/checker verification loop.
- Do not inflate planner prompts with raw ITL blobs.
- Do not make narrative-first context mandatory for all planning paths.

## Common Pitfalls
- Turning inferred research cues into hard implementation tasks without user confirmation
- Duplicating CONTEXT.md content inside plans rather than letting it guide planning
- Weakening the planner/checker contract because the new context feels “smart enough”
- Forgetting PRD express path compatibility
- Changing docs without actually updating the planner handoff rules

## Code Examples
- Current source plan entry point: `commands/gsd/plan-phase.md`
- Current source plan workflow: `get-stuff-done/workflows/plan-phase.md`
- Current enriched context flow: `get-stuff-done/workflows/discuss-phase.md`
- Current research handoff flow: `get-stuff-done/workflows/research-phase.md`

## Prescriptive Recommendation
Implement Phase 8 as the smallest safe vertical slice:

1. Update `plan-phase` so the planner prompt explicitly understands `Implementation Decisions` vs `Research Cues` vs narrative summaries.
2. Make the planner workflow use enriched CONTEXT guidance when available, but remain compatible with PRD-generated or sparse context.
3. Keep PLAN.md and plan validation unchanged as the contracts.
4. Add focused tests/docs proving the planner handoff is richer without weakening planning rigor.

That yields cleaner ITL-to-planning flow without destabilizing the existing planner system.

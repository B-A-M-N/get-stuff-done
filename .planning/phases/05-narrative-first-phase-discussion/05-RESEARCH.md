# Phase 5 Research: Narrative-First Phase Discussion

## Objective
Research how to add ITL-backed narrative intake to the phase discussion workflow so `/dostuff:discuss-phase` can begin from freeform implementation intent, while preserving roadmap scope guardrails, prior-context loading, codebase scouting, and the existing CONTEXT.md contract that downstream research and planning depend on.

Additional steering:
- The installed user-facing command surface is `/dostuff:*`.
- The canonical source files still live under `commands/gsd/` and `get-stuff-done/workflows/`.
- Phase 5 should build on Phase 4’s narrative-first initialization pattern rather than inventing a second narrative system.

## Standard Stack
- **Keep orchestration in the existing source command/workflow pair**
  - `commands/gsd/discuss-phase.md`
  - `get-stuff-done/workflows/discuss-phase.md`
- **Keep implementation logic in existing CommonJS modules**
  - `get-stuff-done/bin/gsd-tools.cjs`
  - `get-stuff-done/bin/lib/itl.cjs`
  - `get-stuff-done/bin/lib/itl-*.cjs`
  - existing `init phase-op` support in `get-stuff-done/bin/lib/init.cjs`
- **Keep output contract in CONTEXT.md form**
  - downstream `RESEARCH.md` and `PLAN.md` generation should still consume a normal CONTEXT artifact
- **Use the existing ITL SQLite audit store**
  - `.planning/itl/audit.sqlite`
- **Testing stack**
  - `node:test`
  - focused assertions in `tests/*.test.cjs`

## Architecture Patterns

### 1. Insert ITL before gray-area questioning, not after
The best integration point is after phase validation and prior-context/codebase loading, but before gray areas are presented.

Recommended order:
1. Validate phase and load existing context state.
2. Load prior project/phase decisions.
3. Scout codebase for relevant patterns.
4. Ask for a short implementation narrative for this phase.
5. Run ITL on that narrative.
6. Use the interpretation to shape gray areas and discussion prompts.
7. Write a standard CONTEXT.md with the clarified decisions.

This preserves the current workflow’s strongest parts while replacing the cold-start questioning step.

### 2. Modify the source `gsd:discuss-phase`, not a separate dostuff source command
As with Phase 4, the repo’s source-of-truth should stay in:
- `commands/gsd/discuss-phase.md`
- `get-stuff-done/workflows/discuss-phase.md`

Phase 3 already established that installed command surfaces can be rewritten into fork-owned `dostuff` commands. Phase 5 should rely on that instead of introducing a separate `commands/dostuff/` tree.

### 3. Use ITL to frame gray areas, not to replace discussion
The purpose of `discuss-phase` is still to capture implementation decisions the user cares about. ITL should improve the first-pass understanding of:
- what the user thinks this phase is really about,
- what constraints or preferences already exist,
- what success looks like,
- which unknowns deserve discussion.

Recommended contract:
- ITL produces structured interpretation and ambiguity findings.
- The workflow maps that interpretation into candidate gray areas.
- The user still chooses what to discuss.
- The output remains a human-readable CONTEXT.md that downstream agents can act on.

### 4. Preserve scope guardrails from the current workflow
This workflow already has a strong distinction between:
- clarifying HOW to implement scoped work,
- and introducing new capabilities that belong in another phase.

Phase 5 should preserve that behavior exactly. Narrative-first input must not weaken the roadmap boundary.

Recommended rule:
- Use ITL interpretation to sharpen gray areas inside the phase.
- If the narrative suggests a new capability, capture it as deferred/backlog context and redirect back to the current phase.

### 5. Reuse bounded clarification patterns from Phase 4
Phase discussion does not need a full exploratory interview before the user sees value.

Recommended behavior:
- capture a narrative about how the user imagines this phase working,
- interpret it,
- display a summary,
- only ask clarification questions when ambiguity would make gray-area generation low quality,
- then continue into selective area discussion.

That keeps the workflow fast while still rigorous.

### 6. CONTEXT.md should remain the downstream contract
Do not let raw ITL output become the final phase discussion artifact.

Recommended mapping:
- interpreted goals/preferences/constraints help generate discussion prompts,
- user-confirmed choices become CONTEXT.md decisions,
- unresolved unknowns become open questions or deferred items,
- codebase and canonical refs remain part of the final CONTEXT artifact.

This ensures `gsd-phase-researcher` and `gsd-planner` do not need a new file format.

### 7. Persist phase discussion narratives in the audit trail
Phase 5 should reuse the same audit persistence established in Phase 2 and exercised in Phase 4.

Persist:
- raw discussion-start narrative,
- structured interpretation,
- ambiguity/confidence result,
- any clarification that materially changed the interpretation.

This creates traceability for why specific CONTEXT decisions were explored.

## Don't Hand-Roll
- Do not create a second discussion engine outside `discuss-phase`; extend the existing workflow.
- Do not replace CONTEXT.md with raw interpretation JSON or summary markdown.
- Do not bypass prior-context loading, codebase scouting, or scope guardrails.
- Do not re-ask decisions already captured in prior CONTEXT files unless the phase truly requires an exception.
- Do not invent a separate installed/source command tree split for discuss-phase.

## Common Pitfalls
- Letting narrative-first intake skip the current scope-boundary discipline
- Treating ITL output as final decisions before the user confirms them
- Generating generic gray areas instead of phase-specific ones informed by the interpreted narrative
- Re-asking previously locked preferences because the narrative layer ignored prior CONTEXT files
- Updating docs to `/dostuff:discuss-phase` while leaving the source workflow logic unchanged

## Code Examples
- Current source command entry point: `commands/gsd/discuss-phase.md`
- Current source workflow: `get-stuff-done/workflows/discuss-phase.md`
- Existing ITL surface: `get-stuff-done/bin/lib/itl.cjs`
- Existing audit persistence: `get-stuff-done/bin/lib/itl-audit.cjs`
- Existing installed narrative router: `commands/gsd/dostuff.md`, `get-stuff-done/workflows/dostuff.md`

## Prescriptive Recommendation
Implement Phase 5 as the smallest safe vertical slice:

1. Update `commands/gsd/discuss-phase.md` and `get-stuff-done/workflows/discuss-phase.md` so discussion begins with a freeform phase narrative after prior-context and codebase loading.
2. Add one ITL-backed helper path for phase-discussion interpretation and bounded clarification.
3. Use the interpretation to generate better gray areas and prompt choices, not to replace user decision-making.
4. Keep scope-guardrails and prior-decision reuse intact.
5. Write a normal CONTEXT.md with user-confirmed decisions and references.
6. Add focused tests/docs so installed `/dostuff:discuss-phase` behavior is clear.

That yields a real narrative-first discussion workflow without weakening the downstream CONTEXT contract or the roadmap boundary.

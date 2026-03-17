# Phase 4 Research: Narrative-First Initialization

## Objective
Research how to add narrative-first initialization on top of the existing `new-project` flow using the Phase 2 ITL primitives, while preserving brownfield detection, auto mode, planning artifact guarantees, and the coexistence-safe install surface established in Phase 3.

Additional steering:
- The installed user-facing command surface is `/dostuff:*`.
- The source command tree still lives under `commands/gsd/` and is rewritten to `dostuff` at install time.
- Phase 4 should not re-open install isolation work or invent a parallel source command tree unless that becomes necessary later.

## Standard Stack
- **Keep orchestration in the existing source command/workflow pair**
  - `commands/gsd/new-project.md`
  - `get-stuff-done/workflows/new-project.md`
- **Keep implementation logic in existing CommonJS modules**
  - `get-stuff-done/bin/gsd-tools.cjs`
  - `get-stuff-done/bin/lib/init.cjs`
  - `get-stuff-done/bin/lib/itl.cjs`
  - `get-stuff-done/bin/lib/itl-*.cjs`
- **Keep artifact generation in the existing planning/template flow**
  - `get-stuff-done/templates/project.md`
  - `get-stuff-done/templates/requirements.md`
- **Use the existing ITL SQLite audit store**
  - `.planning/itl/audit.sqlite`
- **Testing stack**
  - `node:test`
  - focused tests in `tests/dostuff.test.cjs`, `tests/itl.test.cjs`, and new initialization-specific coverage

## Architecture Patterns

### 1. Add ITL intake after environment gates, before synthesis
The clean integration point is after `init new-project` completes setup/brownfield checks and before the current deep-questioning path writes artifacts.

Recommended order:
1. `init new-project` still performs repo, git, planning, and brownfield checks.
2. Brownfield/codebase-map gate stays where it is.
3. Config capture stays early, especially for `--auto`.
4. Narrative intake happens before `PROJECT.md` synthesis.
5. Interpretation summary is shown before files are written.
6. Bounded clarification only runs when ambiguity blocks safe synthesis.

This keeps the existing workflow shape intact and limits Phase 4 to one vertical slice.

### 2. Modify the source `gsd:new-project`, not a new source command tree
The repo currently has:
- `commands/gsd/new-project.md`
- `get-stuff-done/workflows/new-project.md`

Phase 4 should update those source files. Phase 3 already proved the installer rewrites them into fork-owned `dostuff` install surfaces. That means:
- source-of-truth remains in one command/workflow pair
- installed UX remains `/dostuff:new-project` or runtime-equivalent
- there is no need yet for `commands/dostuff/new-project.md` as a separate source file

### 3. Use ITL as a normalization layer, not a replacement for initialization
The ITL should not directly author planning artifacts freehand.

Recommended contract:
- collect narrative
- run ITL extraction + ambiguity scoring
- produce a normalized interpretation object
- feed that object into the existing project/requirements synthesis path

`new-project` should continue owning:
- brownfield and git gates
- workflow config capture
- `PROJECT.md` creation
- `REQUIREMENTS.md` creation
- roadmap routing and downstream workflow continuity

### 4. One interpretation layer, two intake modes
Phase 4 should support both:
- **Interactive narrative mode**
- **`--auto` document mode**

Recommended pattern:
- interactive mode: prompt for a narrative block
- auto mode: use the provided document/pasted text as the narrative source
- both paths call the same ITL interpretation helper

Do not fork the workflow into two separate implementations.

### 5. Clarify only when ambiguity blocks artifact quality
The existing workflow already values deep context gathering. Phase 4 should keep that rigor, but the first move should be narrative capture, not a rigid front-loaded questionnaire.

Recommended behavior:
- low ambiguity: proceed directly from interpretation summary to artifact synthesis
- medium ambiguity: ask one short bounded clarification round
- high ambiguity or contradictions: stop and resolve the blocker before writing planning docs

This preserves safety without throwing away the benefits of narrative-first intake.

### 6. Seed templates from interpreted fields, not raw prose
The safest pattern is to thread structured interpretation fields into the current templates.

Recommended mapping:
- goals -> `PROJECT.md` project purpose / outcomes
- constraints -> `PROJECT.md` constraints / decisions and `REQUIREMENTS.md`
- success criteria -> initial active requirements
- anti-requirements / exclusions -> out-of-scope section
- unknowns / ambiguities -> open questions or explicit follow-up items when needed

That keeps generated artifacts legible and compatible with the rest of GSD planning.

### 7. Record initialization narratives in the ITL audit trail
Phase 2 already introduced local audit persistence. Phase 4 should reuse it instead of inventing a separate initialization log.

Persist:
- raw narrative input
- extracted structured interpretation
- ambiguity/confidence result
- any clarification answer that changed the interpretation

This gives later phases a traceable source for why `PROJECT.md` and `REQUIREMENTS.md` look the way they do.

## Don't Hand-Roll
- Do not build a second initialization engine outside `new-project`; reuse the existing workflow and init helpers.
- Do not create a separate narrative parsing system for initialization; reuse the ITL modules added in Phase 2.
- Do not bypass the existing templates with raw LLM-authored markdown blobs.
- Do not split interactive and auto mode into separate implementations if the only difference is narrative source.
- Do not reopen install-path work in Phase 4; Phase 3 already established the fork-safe runtime projection.

## Common Pitfalls
- Adding narrative-first behavior in docs only, while the actual source workflow still starts with the old questioning flow
- Breaking `--auto` by reintroducing interactive prompts
- Letting ambiguous narratives generate low-quality `PROJECT.md` or `REQUIREMENTS.md`
- Overwriting the user’s framing with generic extractor language instead of using the interpretation as structured seed data
- Editing a non-canonical `commands/dostuff/` source path and leaving the real source command unchanged
- Forgetting that brownfield mapping must still happen before synthesis when existing code is detected

## Code Examples
- Current source command entry point: `commands/gsd/new-project.md`
- Current source workflow: `get-stuff-done/workflows/new-project.md`
- Existing ITL surface: `get-stuff-done/bin/lib/itl.cjs`
- Existing audit persistence: `get-stuff-done/bin/lib/itl-audit.cjs`
- Existing deterministic extraction helpers: `get-stuff-done/bin/lib/itl-extract.cjs`, `itl-ambiguity.cjs`, `itl-summary.cjs`
- Existing install-facing dostuff entry point for command narrative: `commands/gsd/dostuff.md`, `get-stuff-done/workflows/dostuff.md`

## Prescriptive Recommendation
Implement Phase 4 as the smallest safe vertical slice:

1. Update `commands/gsd/new-project.md` and `get-stuff-done/workflows/new-project.md` so initialization opens with a narrative-first intake after setup/brownfield gates.
2. Add one reusable helper in the ITL/init layer that interprets either interactive narrative text or `--auto` document text.
3. Show an interpretation summary before writing artifacts.
4. Run one bounded clarification step only when ambiguity is too high for safe synthesis.
5. Feed interpreted fields into the existing `PROJECT.md` and `REQUIREMENTS.md` generation path.
6. Record the initialization interpretation in `.planning/itl/audit.sqlite`.
7. Add focused tests around interactive intake, auto-mode interpretation, ambiguity-triggered clarification, and artifact seeding.

That yields a real narrative-first `/dostuff:new-project` experience while keeping the code changes local, testable, and compatible with the Phase 3 coexistence model.

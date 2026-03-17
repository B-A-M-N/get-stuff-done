---
phase: "04"
plan: "01"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "FR-01"
---

# SUMMARY: 04-01 - Add ITL-backed narrative intake to source new-project workflow

## Outcome
The canonical `new-project` command/workflow now describes a narrative-first initialization flow that uses the Phase 2 ITL before project artifacts are written.

## Implemented
- Updated `commands/gsd/new-project.md` to describe narrative-first intake, ITL interpretation, and installed `/dostuff:*` next steps.
- Updated `get-stuff-done/workflows/new-project.md` so the workflow now:
  - treats interactive or `--auto` document text as a single `NARRATIVE` source,
  - runs `gsd-tools.cjs itl init-seed`,
  - displays an interpretation summary before writing artifacts,
  - performs one bounded clarification round when ambiguity is high,
  - seeds PROJECT/REQUIREMENTS generation from `project_seed` and `requirements_seed`.
- Added `buildInitializationSeed()` and `cmdItlInitSeed()` in `get-stuff-done/bin/lib/itl.cjs`.
- Added the `itl init-seed` CLI surface in `get-stuff-done/bin/gsd-tools.cjs`.

## Verification
- `node --test tests/itl.test.cjs tests/dostuff.test.cjs`
- `node get-stuff-done/bin/gsd-tools.cjs itl init-seed --text "…"`

## Notes
- The implementation follows the canonical source command/workflow path and relies on Phase 3 install rewriting for the installed `/dostuff:new-project` surface.

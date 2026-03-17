---
phase: "04"
plan: "02"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "FR-01"
---

# SUMMARY: 04-02 - Document and test the installed dostuff narrative-first surface

## Outcome
User-facing docs and focused tests now reflect `/dostuff:new-project` and `/dostuff:quick` as the installed narrative-first surfaces for this fork.

## Implemented
- Updated command/router docs in:
  - `commands/gsd/dostuff.md`
  - `get-stuff-done/workflows/dostuff.md`
  - `get-stuff-done/workflows/help.md`
  - `docs/COMMANDS.md`
  - `docs/ARCHITECTURE.md`
- Added focused command/workflow assertions in `tests/dostuff.test.cjs`.
- Added focused ITL/init-seed coverage in `tests/itl.test.cjs`.

## Verification
- `node --test tests/itl.test.cjs tests/dostuff.test.cjs`
- `rg -n "/dostuff:new-project|/dostuff:quick|itl init-seed|clarification_questions|requirements_seed.active" …`

## Notes
- `tests/init.test.cjs` remains sandbox-sensitive in this environment because its helper shells out through child processes. That limitation is environmental rather than a Phase 4 logic failure, so verification focused on the directly changed ITL and command/workflow surfaces.

---
phase: "05"
plan: "02"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "FR-02"
  - "FR-03"
---

# SUMMARY: 05-02 - Document and test the installed dostuff discuss-phase surface

## Outcome
The installed phase discussion surface is now documented as `/dostuff:discuss-phase`, and focused tests cover the new discuss-phase seed contract and narrative-first workflow content.

## Implemented
- Updated `get-stuff-done/workflows/help.md` to present `/dostuff:discuss-phase` as the user-facing phase discussion entry point.
- Updated `docs/COMMANDS.md` so the command reference describes narrative-first intake, ITL interpretation preview, bounded clarification, and selective gray-area discussion for `/dostuff:discuss-phase`.
- Updated `get-stuff-done/workflows/do.md` so routing guidance points vision/brainstorming requests at `/dostuff:discuss-phase`.
- Extended `tests/itl.test.cjs` with discuss-phase seed coverage.
- Extended `tests/dostuff.test.cjs` with command/workflow assertions for narrative-first `discuss-phase`.

## Verification
- `node --test tests/dostuff.test.cjs`
- `node --test tests/itl.test.cjs`

## Notes
- The source-of-truth command remains `commands/gsd/discuss-phase.md`; Phase 3 install isolation projects that into the installed `/dostuff:*` namespace.

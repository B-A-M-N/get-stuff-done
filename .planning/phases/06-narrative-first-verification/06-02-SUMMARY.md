---
phase: "06"
plan: "02"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "FR-02"
  - "FR-03"
---

# SUMMARY: 06-02 - Document and test the installed dostuff verify-work surface

## Outcome
The installed verification surface is now documented as `/dostuff:verify-work`, and focused tests cover the new verification seed contract and narrative-first verification workflow content.

## Implemented
- Updated `get-stuff-done/workflows/help.md` to present `/dostuff:verify-work` as the user-facing verification entry point.
- Updated `docs/COMMANDS.md` so the command reference describes narrative-first verification intake, ITL interpretation preview, bounded clarification, and standard UAT/gap continuity for `/dostuff:verify-work`.
- Extended `tests/itl.test.cjs` with verification-seed coverage.
- Extended `tests/dostuff.test.cjs` with command/workflow assertions for narrative-first `verify-work`.

## Verification
- `node --test tests/dostuff.test.cjs`
- `node --test tests/itl.test.cjs`

## Notes
- The source-of-truth command remains `commands/gsd/verify-work.md`; Phase 3 install isolation projects that into the installed `/dostuff:*` namespace.

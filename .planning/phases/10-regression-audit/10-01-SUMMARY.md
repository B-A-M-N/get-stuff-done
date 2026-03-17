---
phase: "10"
plan: "01"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "CP-01"
  - "TR-04"
  - "TR-09"
---

# SUMMARY: 10-01 - Audit workflow and code contracts for invariant-safety regressions

## Outcome
The current workflow/docs/runtime contract was audited for invariant-safety drift. No runtime path was found that silently promotes inferred constraints into locked invariants without the adversarial gate, and documentation was tightened where enforcement scope had been easy to overread.

## Implemented
- Audited the current workflow/docs/runtime surface against the Phase 9 gate.
- Confirmed the ITL/runtime layer exposes `guidance-only` vs `lockable` explicitly.
- Tightened docs in `get-stuff-done/workflows/help.md` and `docs/COMMANDS.md` so they no longer imply full workflow enforcement where only the ITL gate currently exists.
- Added focused regression assertions in `tests/dostuff.test.cjs` to keep enforcement-scope wording honest.

## Verification
- `node --test tests/dostuff.test.cjs tests/itl.test.cjs`
- `rg -n "full workflow-by-workflow consumption is still being audited|full downstream workflow enforcement is not claimed|guidance-only" get-stuff-done/workflows/help.md docs/COMMANDS.md get-stuff-done/bin/lib/itl-ambiguity.cjs`

## Notes
- Main audit finding: the gate exists in code, but full workflow-by-workflow consumption is still partial and must not be overstated.

---
phase: "09"
plan: "02"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "TR-05"
  - "TR-06"
  - "TR-08"
  - "TR-09"
---

# SUMMARY: 09-02 - Add adversarial fixtures and document the gate

## Outcome
The adversarial ambiguity gate is now covered by focused fixture tests and documented clearly enough for later workflow enforcement and audit work.

## Implemented
- Extended `tests/itl.test.cjs` with adversarial fixtures for:
  - preference-like pseudo-invariants,
  - emotionally charged vague narratives,
  - low-ambiguity but still non-lockable invariant-style claims.
- Updated `get-stuff-done/workflows/help.md` and `docs/COMMANDS.md` so docs explicitly say inferred constraints are not safe to lock until they pass the adversarial ambiguity gate.

## Verification
- `node --test tests/itl.test.cjs`
- `rg -n "adversarial ambiguity gate|not automatically promoted" get-stuff-done/workflows/help.md docs/COMMANDS.md`

## Notes
- The gate semantics are now explicit in code and docs, but full workflow enforcement remains Phase 10 work.

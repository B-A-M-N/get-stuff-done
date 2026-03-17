---
phase: "06"
plan: "01"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "FR-02"
  - "FR-03"
---

# SUMMARY: 06-01 - Add ITL-backed narrative intake to source verify-work workflow

## Outcome
The canonical `verify-work` command/workflow now describes a narrative-first verification flow that captures a freeform testing narrative, runs ITL interpretation, and feeds that result into test prioritization and expectation framing without replacing the existing UAT loop or gap pipeline.

## Implemented
- Updated `commands/gsd/verify-work.md` to explicitly note the installed `/dostuff:verify-work` surface.
- Updated `get-stuff-done/workflows/verify-work.md` so the workflow now:
  - captures a short verification narrative after loading summaries,
  - runs `gsd-tools.cjs itl verify-seed`,
  - shows an interpretation preview before the first UAT checkpoint,
  - performs one bounded clarification round when ambiguity is high,
  - uses interpreted priorities to frame or reorder tests while preserving the standard UAT and gap flow.
- Added `buildVerificationSeed()` and `cmdItlVerifySeed()` in `get-stuff-done/bin/lib/itl.cjs`.
- Added the `itl verify-seed` CLI surface in `get-stuff-done/bin/gsd-tools.cjs`.

## Verification
- `node --test tests/itl.test.cjs`
- `node get-stuff-done/bin/gsd-tools.cjs itl verify-seed --text "I want to verify the key outcome first, make sure the new flow works, and confirm nothing important regressed." --raw`

## Notes
- Narrative-first verification is additive: user-confirmed UAT, issue logging, severity inference, and gap diagnosis remain the contract.

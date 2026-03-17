---
phase: "01"
plan: "03"
name: "Add dostuff command entry point"
---

# Phase 1 Plan 03 Summary

## One-Line Summary
Added a narrative-first `dostuff` entry point that routes users to `new-project` or `quick`.

## Work Completed
- Created `commands/gsd/dostuff.md`.
- Added `get-stuff-done/workflows/dostuff.md` as the lightweight router workflow.
- Updated command inventory/docs and Copilot skill-count coverage.
- Added targeted tests for command/workflow presence and routing intent.

## Key Files
- `commands/gsd/dostuff.md`
- `get-stuff-done/workflows/dostuff.md`
- `tests/dostuff.test.cjs`
- `tests/copilot-install.test.cjs`

## Verification
- `node --test tests/dostuff.test.cjs`
- `node --test --test-name-pattern "copyCommandsAsCopilotSkills|Copilot agent conversion - real files|Copilot content conversion - engine files|Copilot instructions merge/strip|Copilot uninstall skill removal|Copilot manifest and patches fixes" tests/copilot-install.test.cjs`

## Notes
- The new command is recorded as a soft entry point only; Phase 2 planning is still pending.

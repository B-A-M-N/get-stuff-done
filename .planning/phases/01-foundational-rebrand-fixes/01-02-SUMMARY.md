---
phase: "01"
plan: "02"
name: "Fix Claude Hooks installation bug"
requirements_completed:
  - "FR-11"
  - "FR-12"
---

# Phase 1 Plan 02 Summary

## One-Line Summary
Fixed installer hook registration so distinct commands no longer collide during Claude hook setup.

## Work Completed
- Extracted normalized hook-command comparison helpers in `bin/install.js`.
- Replaced token-based hook deduplication with full-command normalization and exact matching.
- Added focused regression coverage for hook-command normalization and same-event coexistence.

## Key Files
- `bin/install.js`
- `tests/install-hooks.test.cjs`

## Verification
- `node --test tests/install-hooks.test.cjs`

## Notes
- Full installer E2E tests are sandbox-limited in this environment because child process spawning is blocked with `EPERM`.

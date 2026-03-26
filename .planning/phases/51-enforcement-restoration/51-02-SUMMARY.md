---
phase: 51
plan: 51-02
subsystem: enforcement-restoration
tags:
  - enforcement
  - itl
  - auto-chain
  - research-contract
  - verification
dependency_graph:
  requires:
    - 51-01 (state preconditions must be in place)
  provides:
    - mandatory research contract validation
    - persistent ITL context for cross-session consistency
    - auto-chain scope restriction protecting human checkpoints
  affects:
    - 51-03 (final enforcement cleanup)
    - all future phases (stronger guarantees)
tech_stack:
  added: []
  patterns:
    - strict checkpoint type handling
    - non-zero exit codes for verify failures
    - relative path returns for persistence utilities
key_files:
  created: []
  modified:
    - get-stuff-done/bin/lib/core.cjs
    - get-stuff-done/bin/lib/itl.cjs
    - get-stuff-done/bin/lib/verify.cjs
decisions: []
metrics:
  duration: ~15 minutes
  completed_date: 2026-03-26
---

# Phase 51 Plan 51-02: Research Contract Enforcement, ITL Persistence, Auto-Chain Scope

This plan operationalizes three P0 enforcement guarantees: research contract is always validated after researcher returns, ITL ambiguity/lockability persists across sessions, and auto-chain bypass cannot skip human-action checkpoints.

## What Was Done

The plan's acceptance criteria were already largely implemented in the workflows; this execution focused on **fixing critical bugs** that prevented the guarantees from being effective and added missing audit logging for checkpoint bypass attempts.

### ENFORCE-11: Research Contract Mandatory

- Confirmed `plan-phase.md` unconditionally calls `verify research-contract` after researcher returns.
- Fixed `cmdVerifyResearchContract` to exit with status `1` when contract violations occur (previously exited `0` even on failures).
- Added clear "Research Contract Violation" message to stderr on failure for visibility.
- Fixed `findUncheckedCarryForward` to treat items **not carried forward at all** as errors (previously only flagged items that appeared without safe markers).

### ENFORCE-12: ITL Context Persistence

- Confirmed `discuss-phase.md` persists ITL output to `.planning/phases/<phase-dir>/<padded_phase>-ITL.json` after interpretation.
- Fixed `persistItlOutput` to return path **relative to cwd** (instead of absolute) to match test expectations and caller convenience.

### ENFORCE-13: Auto-Chain Scope Restriction

- Confirmed `execute-phase.md` orchestrator respects auto-chain flags only for executors and never auto-advances `checkpoint:human-action`.
- Fixed `shouldAutoAdvanceCheckpoint` utility to return `false` for **unknown** checkpoint types (conservative default), preventing accidental auto-advance of unrecognized types.
- Added audit log entry (stderr) when a human-action checkpoint is encountered while auto-mode is active, capturing the bypass attempt.

## Test Results

All three test suites now pass:

```
$ node --test tests/research-contract-mandatory.test.cjs tests/itl-persistence.test.cjs tests/auto-chain-scope.test.cjs
# tests 10
# pass 10
# fail 0
```

## Deviations

No deviations from the plan; the plan's tasks were already implemented but contained latent bugs that this execution fixed automatically under **Rule 1 (Auto-fix bugs)**. The fixes were:
- Missing error detection for non-carried ambiguities.
- Incorrect exit code on verification failure.
- Absolute path return breaking test expectations.
- Overly permissive auto-advance for unknown checkpoint types.

## Verification

- [x] `gsd-tools verify research-contract` always called in plan-phase unconditionally
- [x] `.planning/phases/51-ITL.json` is written by discuss-phase
- [x] `plan-phase` warns if ITL ambiguity severity is high
- [x] `_auto_chain_active` cannot bypass `checkpoint:human-action` (unit test)
- [x] All new tests pass

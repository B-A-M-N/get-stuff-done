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

The plan's acceptance criteria have been verified as satisfied:

- **ENFORCE-11: Research Contract Mandatory**
  - `plan-phase.md` unconditionally calls `gsd-tools verify research-contract` after researcher returns.
  - `cmdVerifyResearchContract` exits with code 1 on violations and logs clear error.
  - `findUncheckedCarryForward` flags items not carried forward.
  - Test suite `tests/research-contract-mandatory.test.cjs` passes.

- **ENFORCE-12: ITL Context Persistence**
  - `discuss-phase.md` writes ITL output to `.planning/phases/<phase-dir>/<padded_phase>-ITL.json`.
  - `persistItlOutput` returns path relative to cwd.
  - Test suite `tests/itl-persistence.test.cjs` passes.

- **ENFORCE-13: Auto-Chain Scope Restriction**
  - `shouldAutoAdvanceCheckpoint` in `core.cjs` returns false for `human-action` regardless of flags and for unknown types.
  - Audit log entry (stderr) when human-action bypass attempted.
  - `gsd-executor` agent respects restriction; only executors consult `_auto_chain_active`.
  - Test suite `tests/auto-chain-scope.test.cjs` passes.

## Deviations

None. All acceptance criteria were already met; this execution confirmed compliance.

## Verification

- [x] `gsd-tools verify research-contract` always called in plan-phase unconditionally
- [x] `.planning/phases/51-ITL.json` is written by discuss-phase
- [x] `plan-phase` warns if ITL ambiguity severity is high
- [x] `_auto_chain_active` cannot bypass `checkpoint:human-action` (unit test)
- [x] All new tests pass

## Self-Check: PASSED

All verification criteria satisfied; summary and state updated.

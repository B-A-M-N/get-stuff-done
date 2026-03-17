---
phase: "09"
plan: "01"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "TR-05"
  - "TR-08"
  - "TR-09"
---

# SUMMARY: 09-01 - Add adversarial ambiguity and lockability harness to ITL

## Outcome
The ITL ambiguity layer now exposes a separate adversarial lockability result so inferred constraints can remain `guidance-only` unless they survive a deterministic adversarial pass.

## Implemented
- Updated `get-stuff-done/bin/lib/itl-ambiguity.cjs` to add `assessInvariantLockability()`.
- Kept ambiguity and lockability as separate concerns:
  - `assessAmbiguity()` still answers whether clarification is needed.
  - `assessInvariantLockability()` now answers whether inferred constraints are safe to treat as lockable.
- Updated `get-stuff-done/bin/lib/itl.cjs` so ITL results now include `lockability` alongside `ambiguity`.

## Verification
- `node --test tests/itl.test.cjs`
- `rg -n "assessInvariantLockability|guidance-only" get-stuff-done/bin/lib/itl-ambiguity.cjs get-stuff-done/bin/lib/itl.cjs`

## Notes
- This phase creates the gate. It does not yet enforce that every workflow must consume it before promoting inferred invariants.

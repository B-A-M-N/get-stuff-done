---
phase: 78-phase-truth-contracts
plan: 01
subsystem: phase-truth-runtime
tags: [truth, phase-truth, verification, reconciliation, cli, hooks]
provides:
  - machine-authoritative phase truth derivation contract
  - direct `phase-truth generate <phase>` CLI surface
  - automatic truth regeneration after verification, reconciliation, and phase completion
affects: [phase-truth, verification, reconciliation, cli, planning]
tech-stack:
  added: []
  patterns:
    - phase truth synthesizes existing proof, verification, drift, reconciliation, and degraded-state inputs rather than duplicating them
    - verification artifacts are trusted by phase truth only when they pass the existing evidence-first verification contract
key-files:
  created:
    - .planning/phases/78-phase-truth-contracts/78-CONTEXT.md
    - .planning/phases/78-phase-truth-contracts/78-RESEARCH.md
    - .planning/phases/78-phase-truth-contracts/78-01-PLAN.md
    - .planning/phases/78-phase-truth-contracts/78-02-PLAN.md
    - get-stuff-done/bin/lib/phase-truth.cjs
    - tests/phase-truth.test.cjs
    - tests/phase-truth-cli.test.cjs
    - tests/phase-truth-hooks.test.cjs
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - get-stuff-done/bin/gsd-tools.cjs
    - get-stuff-done/bin/lib/verify.cjs
    - get-stuff-done/bin/lib/drift-reconcile.cjs
    - get-stuff-done/bin/lib/phase.cjs
key-decisions:
  - "Phase truth is emitted as authoritative YAML plus rendered markdown rather than overloading VERIFICATION.md."
  - "Verification inputs only contribute to trusted phase truth when they pass the existing evidence-first verification validator."
  - "Generation is both directly invokable and wired into sanctioned truth-transition hooks."
patterns-established:
  - "Pattern 1: phase-level truth is a synthesis shell layered over lower-level truth artifacts."
  - "Pattern 2: sanctioned mutation or assertion surfaces regenerate phase truth through one shared helper instead of duplicating write logic."
requirements-completed: [TRUTH-PHASE-01, TRUTH-VERIFY-01]
context_artifact_ids: [phase-78-phase-truth-contracts]
duration: session-based
completed: 2026-03-27
---

# Phase 78 Plan 01 Summary

**Phase 78 introduced a first-class phase truth contract with deterministic derivation, a direct CLI surface, and automatic regeneration hooks across verification, reconciliation, and phase completion**

## Performance

- **Duration:** session-based
- **Completed:** 2026-03-28T00:30:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added `get-stuff-done/bin/lib/phase-truth.cjs` to derive per-phase truth from summaries, verification artifacts, drift, reconciliation, and degraded-state inputs, then render both `TRUTH.yaml` and `TRUTH.md`.
- Added focused derivation coverage in `tests/phase-truth.test.cjs`, including reconciliation precedence, degraded-state conditionality, missing-proof invalidation, and verification-contract gating.
- Extended `get-stuff-done/bin/gsd-tools.cjs` with `phase-truth generate <phase>`.
- Wired truth regeneration into `verify verification-artifact`, `verify-summary`, `drift reconcile`, and `phase complete` through `get-stuff-done/bin/lib/verify.cjs`, `get-stuff-done/bin/lib/drift-reconcile.cjs`, and `get-stuff-done/bin/lib/phase.cjs`.
- Added CLI and hook coverage in `tests/phase-truth-cli.test.cjs` and `tests/phase-truth-hooks.test.cjs`.
- Captured the final Phase 78 context, research, and split execution plans in the phase directory, and corrected roadmap / requirement traceability for Phases 78 and 79.

## Task Commits

Each task was committed atomically:

1. **Task 1: define the phase-truth machine contract, derivation rules, and validator** - `79ed8a8` (feat)
2. **Task 2: wire explicit CLI generation and update hooks for phase truth** - `cef488f` (feat)

## Proof Index

```json
[
  {
    "task": 1,
    "canonical_commit": "79ed8a8",
    "files": [
      ".planning/ROADMAP.md",
      ".planning/REQUIREMENTS.md",
      ".planning/phases/78-phase-truth-contracts/78-CONTEXT.md",
      ".planning/phases/78-phase-truth-contracts/78-RESEARCH.md",
      ".planning/phases/78-phase-truth-contracts/78-01-PLAN.md",
      ".planning/phases/78-phase-truth-contracts/78-02-PLAN.md",
      "get-stuff-done/bin/lib/phase-truth.cjs",
      "tests/phase-truth.test.cjs"
    ],
    "verify": "node --check get-stuff-done/bin/lib/phase-truth.cjs && node --test tests/phase-truth.test.cjs",
    "evidence": [
      "node --check get-stuff-done/bin/lib/phase-truth.cjs",
      "node --test tests/phase-truth.test.cjs"
    ],
    "runtime_required": false,
    "runtime_proof": []
  },
  {
    "task": 2,
    "canonical_commit": "cef488f",
    "files": [
      "get-stuff-done/bin/gsd-tools.cjs",
      "get-stuff-done/bin/lib/verify.cjs",
      "get-stuff-done/bin/lib/drift-reconcile.cjs",
      "get-stuff-done/bin/lib/phase.cjs",
      "tests/phase-truth-cli.test.cjs",
      "tests/phase-truth-hooks.test.cjs"
    ],
    "verify": "node --check get-stuff-done/bin/gsd-tools.cjs && node --check get-stuff-done/bin/lib/verify.cjs && node --check get-stuff-done/bin/lib/drift-reconcile.cjs && node --check get-stuff-done/bin/lib/phase.cjs && node --test tests/phase-truth-cli.test.cjs tests/phase-truth-hooks.test.cjs",
    "evidence": [
      "node --check get-stuff-done/bin/gsd-tools.cjs",
      "node --check get-stuff-done/bin/lib/verify.cjs",
      "node --check get-stuff-done/bin/lib/drift-reconcile.cjs",
      "node --check get-stuff-done/bin/lib/phase.cjs",
      "node --test tests/phase-truth-cli.test.cjs tests/phase-truth-hooks.test.cjs"
    ],
    "runtime_required": false,
    "runtime_proof": []
  }
]
```

## Outcome

- Phase 78 now treats phase truth as a first-class generated contract rather than a spread of loosely-related artifacts.
- The repo can regenerate phase truth deterministically at the sanctioned operator and lifecycle entrypoints without inventing a second verifier.

## Self-Check

- PASSED: `node --check get-stuff-done/bin/lib/phase-truth.cjs`
- PASSED: `node --check get-stuff-done/bin/gsd-tools.cjs`
- PASSED: `node --check get-stuff-done/bin/lib/verify.cjs`
- PASSED: `node --check get-stuff-done/bin/lib/drift-reconcile.cjs`
- PASSED: `node --check get-stuff-done/bin/lib/phase.cjs`
- PASSED: `node --test tests/phase-truth.test.cjs tests/phase-truth-cli.test.cjs tests/phase-truth-hooks.test.cjs`

---

*Phase: 78-phase-truth-contracts*

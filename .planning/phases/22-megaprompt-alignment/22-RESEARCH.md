# Phase 22 Research: Megaprompt Alignment

**Goal:** Align all GSD agents and workflows with the canonical enforcement contract defined in `MEGAPROMPT.md`.

## 1. Executor CONTEXT.md Compliance (P1 / INV-03)
- **Requirement:** Check if auto-fix fix contradicts a locked decision in `CONTEXT.md` before applying Rule 1, 2, or 3.
- **Implementation:** 
  - Update `agents/gsd-executor.md`.
  - Add step to scan `CONTEXT.md` ## Decisions.
  - If conflict detected, escalate to Rule 4 (human required).

## 2. Cross-Plan Data Contract Gate (P2 / Dimension 9)
- **Requirement:** Detect data races and export-level conflicts between parallel plans in the same wave.
- **Implementation:**
  - Update `agents/gsd-plan-checker.md`.
  - Implement Dimension 9 logic: Collect read/write sets per plan, flag intersections in the same wave.

## 3. Quick Command Scope Probing (P3)
- **Requirement:** Ask complexity, dependency, and reversibility questions before non-trivial quick tasks.
- **Implementation:**
  - Update `commands/gsd/quick.md`.
  - Add pre-flight questions.
  - Add routing logic to suggest full `plan-phase` for architectural changes.

## 4. verify-work Auto-Diagnosis (P4)
- **Requirement:** README claims debug agents are spawned on failure.
- **Implementation:**
  - Update `get-stuff-done/workflows/verify-work.md`.
  - On test failure, offer to spawn `gsd-debugger` with failure context.

## 5. debug Command Structured Diagnosis (P5)
- **Requirement:** Implement the 3-question hypothesis framing protocol.
- **Implementation:**
  - Update `commands/gsd/debug.md`.
  - Add "Has this ever worked?", "Broken every time?", "Already tried?" questions.
  - Mandate hypothesis framing before each attempt.

## 6. CHANGELOG Accuracy (P6 / INV-07)
- **Requirement:** Remove or label phantom features as planned.
- **Implementation:**
  - Update `CHANGELOG.md`.
  - Mark "Cross-Plan Data Contracts" and "Export-level spot check" as `[planned]`.

## 7. Mandatory Coverage (Rule 4)
- **Requirement:** Ensure 100% line-coverage for `packages/itl` and newly modified surfaces.
- **Implementation:**
  - Run `npm run test:coverage` (or equivalent).
  - Add tests if gaps found.

# Phase 20 Research: Scenario and Contract Tests

**Goal:** Ensure the full pause-clarify-blocked-resume-resolve behavioral loop is covered by end-to-end tests, and all execution artifact schemas have contract test coverage.

## 1. End-to-End Behavioral Loop (TEST-01)

### Current Status
The "blocked" state logic is distributed across `discuss-phase.md` (which sets it) and `resume-project.md` (which checks it).

### Implementation Strategy
Create a new integration test that:
1. Spawns a temporary git project.
2. Simulates an ambiguous narrative intake via `gsd-tools itl interpret`.
3. Manually sets `clarification_status: blocked` in `STATE.md`.
4. Runs `resume-project` (simulated) and verifies it halts with unblock instructions instead of proceeding to plan/execute.
5. Simulates a user resolution and verifies the status transitions to `resolved`.

## 2. Gate Enforcement Tests (TEST-02)

### Implementation Strategy
Add tests to verify the bash-level gates injected in Phase 17/19:
- Set `clarification_status: blocked` in `STATE.md`.
- Run `gsd-tools init plan-phase` and `init execute-phase`.
- Assert that the command output (or exit code if wrapped) indicates a blocked state.
- Verify `plan-phase.md` and `execute-phase.md` logic (simulated) exits early.

## 3. Checkpoint Lifecycle Tests (TEST-03)

### Implementation Strategy
Verify the 3-stage lifecycle:
1. **Create:** Trigger a checkpoint in a mock execution and verify `CHECKPOINT.md` is written.
2. **Validate:** Run `resume-project` and verify it validates the `CHECKPOINT.md` against the schema.
3. **Clear:** Resolve the checkpoint and verify `CHECKPOINT.md` is updated/cleared and `STATE.md` fields are removed.

## 4. Execution Artifact Contract (TEST-04)

### Implementation Strategy
The `executionSummarySchema` in `artifact-schema.cjs` needs to be expanded to match the full `SUMMARY.md` template.
- **Fields to add:** `subsystem`, `tags`, `requires`, `provides`, `affects`, `tech-stack`, `key-files`, `key-decisions`, `patterns-established`, `duration`, `completed`.
- **Validation:** Update `cmdVerifySummary` (done in Phase 19) to enforce this richer schema.
- **Test:** Add a contract test that validates a real-world `SUMMARY.md` (like `19-01-SUMMARY.md`) against this schema.

## 5. Untracked Test Files (TEST-05)

### Status
The following 5 files exist in the `tests/` directory but are not yet committed to git:
- `tests/checkpoint-contract.test.cjs`
- `tests/checkpoint-validator.test.cjs`
- `tests/state-clarification.test.cjs`
- `tests/verify-context-contract.test.cjs`
- `tests/verify-research-contract.test.cjs`

### Action
1. Audit these files for any hardcoded paths or stale logic.
2. Ensure they pass on the current codebase.
3. Stage and commit them.

## 6. Implementation Sequence
1. **Plan 20-01:** Commit the 5 untracked test files after auditing and fixing them.
2. **Plan 20-02:** Expand `executionSummarySchema` and implement the contract test.
3. **Plan 20-03:** Implement the end-to-end behavioral loop and gate enforcement tests.

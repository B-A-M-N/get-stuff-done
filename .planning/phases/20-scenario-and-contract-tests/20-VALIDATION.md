---
phase: 20
slug: scenario-and-contract-tests
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-17
---

# Phase 20 Validation Strategy: Scenario and Contract Tests

**Goal:** Provide full end-to-end and contract test coverage for the v0.2.0 orchestration integrity model.

## Validation Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — scripts/run-tests.cjs auto-discovers *.test.cjs |
| **Quick run command** | `node scripts/run-tests.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~40 seconds |

---

## Sampling Rate

- **After every task commit:** Run the specific test file being modified
- **After every plan wave:** Run `node scripts/run-tests.cjs`
- **Before final completion:** All tests (including the 5 new ones) must be green
- **Max feedback latency:** 40 seconds

---

## Dimension 8: Verification Matrix (Nyquist)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | TEST-05 | regression | `node --test tests/checkpoint-contract.test.cjs` | ✅ existing | ⬜ pending |
| 20-02-01 | 02 | 1 | TEST-04 | contract | `node --test tests/summary-contract.test.cjs` | ❌ W0 (new file) | ⬜ pending |
| 20-03-01 | 03 | 2 | TEST-01 | E2E | `node --test tests/scenario-loop.test.cjs` | ❌ W0 (new file) | ⬜ pending |
| 20-03-02 | 03 | 2 | TEST-02 | gate | `node --test tests/gate-enforcement.test.cjs` | ❌ W0 (new file) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] All 5 untracked files exist in `tests/`.
- [x] `executionSummarySchema` exists in `artifact-schema.cjs`.

---

## Manual-Only Verifications

| Behavior | Manual Verification Steps | Expected Outcome |
|----------|---------------------------|------------------|
| CI Integration | Run `git status` after Plan 01 | The 5 test files are tracked by git. |
| Loop Recovery | Set `blocked`, run `resume`, resolve, then run `execute` | The workflow proceeds to execution only after resolution. |

---
phase: 17
slug: runtime-gate-enforcement
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-17
---

# Phase 17 Validation Strategy: Runtime Gate Enforcement

**Goal:** Ensure all core workflows (plan-phase, execute-phase, resume-project, autonomous) strictly enforce the `clarification_status: blocked` state and mandatory verification gates.

## Validation Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — scripts/run-tests.cjs auto-discovers *.test.cjs |
| **Quick run command** | `node --test tests/runtime-gate.test.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~5 seconds (quick), ~35 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/runtime-gate.test.cjs`
- **After every plan wave:** Run `node scripts/run-tests.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Dimension 8: Verification Matrix (Nyquist)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | ENFORCE-01 | unit | `node --test tests/state.test.cjs` | ✅ existing | ⬜ pending |
| 17-02-01 | 02 | 1 | ENFORCE-01 | integration | `node --test tests/runtime-gate.test.cjs` | ❌ W0 (new file) | ⬜ pending |
| 17-03-01 | 03 | 2 | ENFORCE-05 | integration | `node --test tests/runtime-gate.test.cjs` | ✅ existing | ⬜ pending |
| 17-04-01 | 04 | 2 | ENFORCE-03 | integration | `node --test tests/runtime-gate.test.cjs` | ✅ existing | ⬜ pending |
| 17-05-01 | 05 | 2 | ENFORCE-02 | integration | `node --test tests/runtime-gate.test.cjs` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/runtime-gate.test.cjs` — created by Plan 02 Task 1, contains stubs for blocked state rejection across all workflows.
- [x] `gsd-tools.cjs state json` — exists, provides the status detection mechanism.

---

## Manual-Only Verifications

| Behavior | Manual Verification Steps | Expected Outcome |
|----------|---------------------------|------------------|
| Blocked Autonomous | Set `clarification_status: blocked` and run `/gsd:autonomous` | Autonomous stops at the first phase check with a blocked error. |
| Resume Routing | Set `clarification_status: blocked` and run `/gsd:resume-project` | Resume presents the blocker and routes only to unblock/clarify. |
| Research Gate | Run `/gsd:plan-phase` with invalid RESEARCH.md content | Workflow halts after researcher returns with a contract violation. |

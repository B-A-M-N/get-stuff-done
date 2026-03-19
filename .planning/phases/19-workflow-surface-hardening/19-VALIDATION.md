---
phase: 19
slug: workflow-surface-hardening
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-17
---

# Phase 19 Validation Strategy: Workflow Surface Hardening

**Goal:** Ensure all remaining workflow surfaces are hardened with blocked-state gates, SUMMARY.md conforms to its schema contract, and orphaned workflows are reconciled.

## Validation Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — scripts/run-tests.cjs auto-discovers *.test.cjs |
| **Quick run command** | `node --test tests/workflow-hardening.test.cjs` |
| **Full suite command** | `node scripts/run-tests.cjs` |
| **Estimated runtime** | ~5 seconds (quick), ~35 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/workflow-hardening.test.cjs`
- **After every plan wave:** Run `node scripts/run-tests.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Dimension 8: Verification Matrix (Nyquist)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | SURFACE-01 | integration | `node --test tests/workflow-hardening.test.cjs` | ❌ W0 (new file) | ⬜ pending |
| 19-02-01 | 02 | 1 | SCHEMA-03 | unit | `node --test tests/workflow-hardening.test.cjs` | ✅ existing | ⬜ pending |
| 19-03-01 | 03 | 2 | SURFACE-03 | integration | `ls commands/gsd/diagnose.md` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/workflow-hardening.test.cjs` — created by Plan 01, contains tests for blocked gates and summary validation.
- [x] `gsd-tools.cjs verify summary` — exists, to be upgraded in Plan 02.

---

## Manual-Only Verifications

| Behavior | Manual Verification Steps | Expected Outcome |
|----------|---------------------------|------------------|
| Blocked Research | Set `clarification_status: blocked` and run `/gsd:research-phase` | Workflow halts at entry with a blocked error. |
| Blocked Validate | Set `clarification_status: blocked` and run `/gsd:validate-phase` | Workflow halts at entry with a blocked error. |
| Summary Schema | Run `gsd-tools verify summary` on a malformed SUMMARY.md | Verification fails with specific schema errors (missing phase/plan). |
| diagnose command | Run `/gsd:diagnose` | The parallel debugging workflow starts correctly. |
